package com.healthlab.mealthroutine.backend.exercise;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.healthlab.mealthroutine.backend.exercise.repository.WorkoutSessionRepository;
import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.mockito.stubbing.Answer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Two record uploads with the same requestId at the same moment, on the real MySQL. No test-level transaction: each
 * request commits on its own. Rows are deleted after each test. Same pattern as RoutineRequestIdRaceTests: the first
 * upload is held inside its requestId lookup after locking the member's row, and the second must wait on that lock.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class WorkoutRecordRaceTests {

    private static final String RECORDS = "/api/v1/workout-sessions/records";
    private static final long EXERCISE_ID = 2961L;
    private static long nextUserId = 9970L;

    private static final String BODY = """
            {"requestId":"rec-race","startedAt":"2026-01-10T01:00:00Z","endedAt":"2026-01-10T01:30:00Z",
             "exercises":[{"exerciseId":2961,"recordType":"reps","setTargets":[{"reps":10},{"reps":10}],
               "completedSets":[{"setNumber":1,"reps":10},{"setNumber":2,"reps":9}]}]}""";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @MockitoSpyBean
    private WorkoutSessionRepository sessionRepository;

    private long userId;
    private ExecutorService pool;

    @BeforeEach
    void setUp() {
        userId = nextUserId++;
        jdbcTemplate.update("insert into users (user_id, username, is_agreed_term) values (?, '기록경합', true)",
                userId);
        jdbcTemplate.update("insert into exercises (exercise_id, name, difficulty, exercise_type, exercise_equipment)"
                + " values (?, '푸시업', 'beginner', '가슴', 'body')", EXERCISE_ID);
        pool = Executors.newFixedThreadPool(2);
    }

    @AfterEach
    void cleanUp() {
        pool.shutdownNow();
        jdbcTemplate.update("delete st from workout_session_sets st join workout_session_exercises e"
                + " on e.workout_session_exercises_id = st.workout_session_exercises_id"
                + " join workout_sessions s on s.workout_session_id = e.workout_session_id where s.user_id = ?",
                userId);
        jdbcTemplate.update("delete e from workout_session_exercises e join workout_sessions s"
                + " on s.workout_session_id = e.workout_session_id where s.user_id = ?", userId);
        jdbcTemplate.update("delete from workout_sessions where user_id = ?", userId);
        jdbcTemplate.update("delete from exercises where exercise_id = ?", EXERCISE_ID);
        jdbcTemplate.update("delete from users where user_id = ?", userId);
    }

    @Test
    void sameKeySameBodyAtOnceReturnsTheFirstSession() throws Exception {
        Race race = startRace(BODY, BODY);

        assertThat(race.first().getStatus()).isEqualTo(201);
        assertThat(race.second().getStatus()).isEqualTo(200);
        assertThat((Boolean) JsonPath.read(race.second().getContentAsString(), "$.data.created")).isFalse();
        assertThat(sessionId(race.second())).isEqualTo(sessionId(race.first()));
        assertThat(countSessions()).isOne();
    }

    @Test
    void sameKeyDifferentBodyAtOnceIsARequestConflict() throws Exception {
        Race race = startRace(BODY, BODY.replace("\"reps\":9", "\"reps\":8"));

        assertThat(race.first().getStatus()).isEqualTo(201);
        assertThat(race.second().getStatus()).isEqualTo(409);
        assertThat((String) JsonPath.read(race.second().getContentAsString(), "$.errorCode"))
                .isEqualTo("REQUEST_CONFLICT");
        assertThat(countSessions()).isOne();
    }

    @Test
    void separateCommittedUploadsFollowTheSameRules() throws Exception {
        MockHttpServletResponse first = upload(BODY);
        MockHttpServletResponse again = upload(BODY);
        MockHttpServletResponse changed = upload(BODY.replace("01:30:00Z", "01:40:00Z"));

        assertThat(first.getStatus()).isEqualTo(201);
        assertThat(again.getStatus()).isEqualTo(200);
        assertThat(sessionId(again)).isEqualTo(sessionId(first));
        assertThat(changed.getStatus()).isEqualTo(409);
        assertThat(countSessions()).isOne();
    }

    private record Race(MockHttpServletResponse first, MockHttpServletResponse second) {
    }

    private Race startRace(String firstBody, String secondBody) throws Exception {
        CountDownLatch insideLookup = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicBoolean firstCall = new AtomicBoolean(true);
        // A spied Spring Data repository is an interface proxy, so delegate through the spy's default answer.
        Answer<?> real = Mockito.mockingDetails(sessionRepository).getMockCreationSettings().getDefaultAnswer();
        doAnswer(invocation -> {
            if (firstCall.getAndSet(false)) {
                insideLookup.countDown();
                await(release);
            }
            return real.answer(invocation);
        }).when(sessionRepository).findByUserIdAndRequestId(anyLong(), anyString());

        Future<MockHttpServletResponse> first = pool.submit(() -> upload(firstBody));
        await(insideLookup);
        Future<MockHttpServletResponse> second = pool.submit(() -> upload(secondBody));
        assertStillWaiting(second);

        release.countDown();
        return new Race(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
    }

    private MockHttpServletResponse upload(String body) throws Exception {
        return mockMvc.perform(post(RECORDS)
                        .header(HttpHeaders.AUTHORIZATION,
                                "Bearer " + jwtTokenProvider.createAccessToken(userId, UserRole.USER, Instant.now()))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn().getResponse();
    }

    private int countSessions() {
        Integer count = jdbcTemplate.queryForObject(
                "select count(*) from workout_sessions where user_id = ?", Integer.class, userId);
        return count == null ? 0 : count;
    }

    private static long sessionId(MockHttpServletResponse response) throws Exception {
        return ((Number) JsonPath.read(response.getContentAsString(), "$.data.workoutSessionId")).longValue();
    }

    private static void assertStillWaiting(Future<?> future) throws InterruptedException {
        Thread.sleep(300); // only to show it does not finish while the lock is held; the order is set by latches
        assertThat(future.isDone()).isFalse();
    }

    private static void await(CountDownLatch latch) {
        try {
            assertThat(latch.await(10, TimeUnit.SECONDS)).isTrue();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }
}
