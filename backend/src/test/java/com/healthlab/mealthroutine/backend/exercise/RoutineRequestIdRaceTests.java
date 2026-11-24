package com.healthlab.mealthroutine.backend.exercise;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.healthlab.mealthroutine.backend.exercise.repository.ExerciseRoutineRepository;
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
 * Two creates with the same requestId at the same moment, on the real MySQL. No test-level transaction: each request
 * commits on its own, like on a real server. Rows are deleted after each test.
 *
 * <p>The first request is held inside its requestId lookup with latches, after it has locked the member's row. The
 * second request is started and must wait on that lock instead of running its own lookup. Without the lock both
 * lookups would miss and the second insert would end in 409 DATA_CONFLICT (review of the routine contract PR).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RoutineRequestIdRaceTests {

    private static final String ROUTINES = "/api/v1/workout-routines";
    private static final long EXERCISE_ID = 2951L;
    private static long nextUserId = 9950L;

    private static final String BODY = """
            {"routineName":"하체 루틴","requestId":"rt-race","items":[{"exerciseId":2951,"recordType":"weight",
              "sets":[{"reps":12,"weightKg":40},{"reps":10,"weightKg":50}]}]}""";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @MockitoSpyBean
    private ExerciseRoutineRepository routineRepository;

    private long userId;
    private ExecutorService pool;

    @BeforeEach
    void setUp() {
        userId = nextUserId++;
        jdbcTemplate.update("insert into users (user_id, username, is_agreed_term) values (?, '루틴경합', true)",
                userId);
        jdbcTemplate.update("insert into exercises (exercise_id, name, difficulty, exercise_type, exercise_equipment)"
                + " values (?, '스쿼트', 'beginner', '하체', 'body')", EXERCISE_ID);
        pool = Executors.newFixedThreadPool(2);
    }

    @AfterEach
    void cleanUp() {
        pool.shutdownNow();
        jdbcTemplate.update("delete i from exercise_routine_items i join exercise_routines r"
                + " on r.routine_id = i.routine_id where r.owner_user_id = ?", userId);
        jdbcTemplate.update("delete from exercise_routines where owner_user_id = ?", userId);
        jdbcTemplate.update("delete from exercises where exercise_id = ?", EXERCISE_ID);
        jdbcTemplate.update("delete from users where user_id = ?", userId);
    }

    @Test
    void sameKeySameBodyAtOnceReturnsTheFirstRoutine() throws Exception {
        Race race = startRace(BODY, BODY);

        assertThat(race.first().getStatus()).isEqualTo(201);
        assertThat(race.second().getStatus()).isEqualTo(200);
        assertThat((Boolean) JsonPath.read(race.second().getContentAsString(), "$.data.created")).isFalse();
        assertThat(routineId(race.second())).isEqualTo(routineId(race.first()));
        assertThat(countRoutines()).isOne();
    }

    @Test
    void sameKeyDifferentBodyAtOnceIsARequestConflict() throws Exception {
        Race race = startRace(BODY, BODY.replace("하체 루틴", "다른 루틴"));

        assertThat(race.first().getStatus()).isEqualTo(201);
        assertThat(race.second().getStatus()).isEqualTo(409);
        assertThat((String) JsonPath.read(race.second().getContentAsString(), "$.errorCode"))
                .isEqualTo("REQUEST_CONFLICT");
        assertThat(countRoutines()).isOne();
    }

    @Test
    void separateCommittedRequestsFollowTheSameRules() throws Exception {
        // Each call is its own committed transaction here (no test transaction), unlike RoutineContractTests.
        MockHttpServletResponse first = create(BODY);
        MockHttpServletResponse again = create(BODY);
        MockHttpServletResponse changed = create(BODY.replace("\"reps\":10", "\"reps\":9"));

        assertThat(first.getStatus()).isEqualTo(201);
        assertThat(again.getStatus()).isEqualTo(200);
        assertThat(routineId(again)).isEqualTo(routineId(first));
        assertThat(changed.getStatus()).isEqualTo(409);
        assertThat(countRoutines()).isOne();
    }

    private record Race(MockHttpServletResponse first, MockHttpServletResponse second) {
    }

    /**
     * Holds the first request inside its requestId lookup (it has already locked the member's row), starts the
     * second request, checks that it is waiting, then lets the first one finish and commit.
     */
    private Race startRace(String firstBody, String secondBody) throws Exception {
        CountDownLatch insideLookup = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicBoolean firstCall = new AtomicBoolean(true);
        // A spied Spring Data repository is an interface proxy, so delegate through the spy's default answer.
        Answer<?> real = Mockito.mockingDetails(routineRepository).getMockCreationSettings().getDefaultAnswer();
        doAnswer(invocation -> {
            if (firstCall.getAndSet(false)) {
                insideLookup.countDown();
                await(release);
            }
            return real.answer(invocation);
        }).when(routineRepository).findByOwnerUserIdAndRequestId(anyLong(), anyString());

        Future<MockHttpServletResponse> first = pool.submit(() -> create(firstBody));
        await(insideLookup);
        Future<MockHttpServletResponse> second = pool.submit(() -> create(secondBody));
        assertStillWaiting(second);

        release.countDown();
        return new Race(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
    }

    private MockHttpServletResponse create(String body) throws Exception {
        return mockMvc.perform(post(ROUTINES)
                        .header(HttpHeaders.AUTHORIZATION,
                                "Bearer " + jwtTokenProvider.createAccessToken(userId, UserRole.USER, Instant.now()))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn().getResponse();
    }

    private int countRoutines() {
        Integer count = jdbcTemplate.queryForObject(
                "select count(*) from exercise_routines where owner_user_id = ?", Integer.class, userId);
        return count == null ? 0 : count;
    }

    private static long routineId(MockHttpServletResponse response) throws Exception {
        return ((Number) JsonPath.read(response.getContentAsString(), "$.data.routineId")).longValue();
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
