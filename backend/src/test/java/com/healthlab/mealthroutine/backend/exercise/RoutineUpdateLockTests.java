package com.healthlab.mealthroutine.backend.exercise;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.healthlab.mealthroutine.backend.exercise.repository.ExerciseRoutineRepository;
import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.util.List;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Row locks taken by routine PATCH and DELETE (security review of the routine contract PR), on the real MySQL.
 * No test-level transaction: each request commits on its own. Rows are deleted after each test.
 *
 * <p>Only the owner may lock a routine's row: another member's request and a request for an id that does not exist
 * must answer without taking or waiting for that lock. Two updates by the owner must still run one after the other,
 * and the second must see what the first committed.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RoutineUpdateLockTests {

    private static final String ROUTINES = "/api/v1/workout-routines";
    private static final long EXERCISE_A = 2971L;
    private static final long EXERCISE_B = 2972L;
    private static long nextUserId = 9980L;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @MockitoSpyBean
    private ExerciseRoutineRepository routineRepository;

    private long owner;
    private long other;
    private long routineId;
    private ExecutorService pool;

    @BeforeEach
    void setUp() throws Exception {
        owner = nextUserId++;
        other = nextUserId++;
        for (long id : List.of(owner, other)) {
            jdbcTemplate.update("insert into users (user_id, username, is_agreed_term) values (?, '잠금', true)", id);
        }
        jdbcTemplate.update("insert into exercises (exercise_id, name, difficulty, exercise_type, exercise_equipment)"
                + " values (?, '스쿼트', 'beginner', '하체', 'body'), (?, '런지', 'beginner', '하체', 'body')",
                EXERCISE_A, EXERCISE_B);
        MockHttpServletResponse created = send(post(ROUTINES), owner, """
                {"routineName":"공개 루틴","visibility":"public","items":[{"exerciseId":2971,"recordType":"reps",
                  "sets":[{"reps":10}]}]}""");
        assertThat(created.getStatus()).isEqualTo(201);
        routineId = ((Number) JsonPath.read(created.getContentAsString(), "$.data.routineId")).longValue();
        Mockito.clearInvocations(routineRepository);
        pool = Executors.newFixedThreadPool(3);
    }

    @AfterEach
    void cleanUp() {
        pool.shutdownNow();
        jdbcTemplate.update("delete i from exercise_routine_items i join exercise_routines r"
                + " on r.routine_id = i.routine_id where r.owner_user_id in (?, ?)", owner, other);
        jdbcTemplate.update("delete from exercise_routines where owner_user_id in (?, ?)", owner, other);
        jdbcTemplate.update("delete from exercises where exercise_id in (?, ?)", EXERCISE_A, EXERCISE_B);
        jdbcTemplate.update("delete from users where user_id in (?, ?)", owner, other);
    }

    @Test
    void anotherMembersRequestDoesNotWaitForTheOwnersLock() throws Exception {
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Future<?> holder = pool.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(s -> {
            jdbcTemplate.queryForObject("select routine_id from exercise_routines where routine_id = ? for update",
                    Long.class, routineId);
            locked.countDown();
            await(release);
        }));
        await(locked);

        // While the owner's row is locked, a stranger is answered right away instead of queueing behind the lock.
        Future<MockHttpServletResponse> patchByOther =
                pool.submit(() -> send(patch(ROUTINES + "/" + routineId), other, "{\"routineName\":\"x\"}"));
        assertThat(patchByOther.get(5, TimeUnit.SECONDS).getStatus()).isEqualTo(403);
        Future<MockHttpServletResponse> deleteByOther =
                pool.submit(() -> send(delete(ROUTINES + "/" + routineId), other, null));
        assertThat(deleteByOther.get(5, TimeUnit.SECONDS).getStatus()).isEqualTo(403);

        release.countDown();
        holder.get(10, TimeUnit.SECONDS);
    }

    @Test
    void onlyTheOwnerEverTakesTheRowLock() throws Exception {
        assertThat(send(patch(ROUTINES + "/" + routineId), other, "{\"routineName\":\"x\"}").getStatus())
                .isEqualTo(403);
        assertThat(send(delete(ROUTINES + "/" + routineId), other, null).getStatus()).isEqualTo(403);
        // An id that does not exist: under REPEATABLE READ a FOR UPDATE here would gap-lock the end of the table.
        assertThat(send(patch(ROUTINES + "/999999999"), other, "{\"routineName\":\"x\"}").getStatus())
                .isEqualTo(404);
        assertThat(send(delete(ROUTINES + "/999999999"), other, null).getStatus()).isEqualTo(404);
        verify(routineRepository, never()).findForUpdate(anyLong());

        assertThat(send(patch(ROUTINES + "/" + routineId), owner, "{\"routineName\":\"주인\"}").getStatus())
                .isEqualTo(200);
        verify(routineRepository).findForUpdate(routineId);
    }

    @Test
    void ownersSecondUpdateWaitsAndSeesTheFirstOnesItems() throws Exception {
        Gate gate = holdFirstLockedRead();
        Future<MockHttpServletResponse> first = pool.submit(() -> send(patch(ROUTINES + "/" + routineId), owner, """
                {"items":[{"exerciseId":2972,"recordType":"reps","sets":[{"reps":5},{"reps":6}]}]}"""));
        await(gate.held());

        // No expectedRevision: it must wait for the first update, then replace the items that one committed.
        Future<MockHttpServletResponse> second = pool.submit(() -> send(patch(ROUTINES + "/" + routineId), owner, """
                {"items":[{"exerciseId":2971,"recordType":"reps","sets":[{"reps":7}]}]}"""));
        assertStillWaiting(second);

        gate.release().countDown();
        assertThat(first.get(10, TimeUnit.SECONDS).getStatus()).isEqualTo(200);
        MockHttpServletResponse secondResponse = second.get(10, TimeUnit.SECONDS);
        assertThat(secondResponse.getStatus()).isEqualTo(200);
        assertThat((Integer) JsonPath.read(secondResponse.getContentAsString(), "$.data.revision")).isEqualTo(3);

        String body = send(get(ROUTINES + "/" + routineId), owner, null).getContentAsString();
        assertThat((Integer) JsonPath.read(body, "$.data.items.length()")).isEqualTo(1);
        assertThat((Integer) JsonPath.read(body, "$.data.items[0].exerciseId")).isEqualTo((int) EXERCISE_A);
        assertThat((Integer) JsonPath.read(body, "$.data.items[0].sets[0].reps")).isEqualTo(7);
    }

    @Test
    void ownersStaleRevisionIsRefusedAfterWaiting() throws Exception {
        Gate gate = holdFirstLockedRead();
        Future<MockHttpServletResponse> first = pool.submit(() -> send(patch(ROUTINES + "/" + routineId), owner,
                "{\"expectedRevision\":1,\"routineName\":\"폰\"}"));
        await(gate.held());
        Future<MockHttpServletResponse> second = pool.submit(() -> send(patch(ROUTINES + "/" + routineId), owner,
                "{\"expectedRevision\":1,\"routineName\":\"PC\"}"));
        assertStillWaiting(second);

        gate.release().countDown();
        assertThat(first.get(10, TimeUnit.SECONDS).getStatus()).isEqualTo(200);
        MockHttpServletResponse stale = second.get(10, TimeUnit.SECONDS);
        assertThat(stale.getStatus()).isEqualTo(409);
        assertThat((Integer) JsonPath.read(stale.getContentAsString(), "$.data.currentRevision")).isEqualTo(2);
    }

    private record Gate(CountDownLatch held, CountDownLatch release) {
    }

    /** The first findForUpdate takes the lock for real, then waits until released while still holding it. */
    private Gate holdFirstLockedRead() {
        Gate gate = new Gate(new CountDownLatch(1), new CountDownLatch(1));
        AtomicBoolean firstCall = new AtomicBoolean(true);
        Answer<?> real = Mockito.mockingDetails(routineRepository).getMockCreationSettings().getDefaultAnswer();
        doAnswer(invocation -> {
            Object result = real.answer(invocation); // the lock is held from here on
            if (firstCall.getAndSet(false)) {
                gate.held().countDown();
                await(gate.release());
            }
            return result;
        }).when(routineRepository).findForUpdate(anyLong());
        return gate;
    }

    private MockHttpServletResponse send(MockHttpServletRequestBuilder request, long userId, String json)
            throws Exception {
        request.header(HttpHeaders.AUTHORIZATION,
                "Bearer " + jwtTokenProvider.createAccessToken(userId, UserRole.USER, Instant.now()));
        if (json != null) {
            request.contentType(MediaType.APPLICATION_JSON).content(json);
        }
        return mockMvc.perform(request).andReturn().getResponse();
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
