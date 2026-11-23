package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.healthlab.mealthroutine.backend.user.domain.HealthMeasurement;
import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.healthlab.mealthroutine.backend.user.repository.HealthMeasurementRepository;
import com.jayway.jsonpath.JsonPath;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Commits, the row lock and concurrent PATCHes (HEALTH8-17), measured on the real MySQL. No test-level
 * transaction: each request commits on its own, like on a real server. Rows are deleted after each test.
 * "In this order" tests hold the first PATCH inside its row lock with latches, start the second one, check that
 * it is still waiting, then release (same pattern as PinRaceTests).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class HealthMeasurementRaceTests {

    private static final String MEASUREMENTS = "/api/v1/health/measurements";
    private static final Instant NOW = Instant.parse("2026-11-23T03:00:00Z");
    private static final LocalDateTime MEASURED = LocalDateTime.of(2026, 11, 22, 9, 0, 0);
    private static long nextId = 9850L;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @MockitoSpyBean
    private HealthMeasurementRepository measurementRepository;

    @MockitoBean
    private Clock clock;

    private long userId;
    private ExecutorService pool;

    @BeforeEach
    void setUp() {
        given(clock.instant()).willReturn(NOW);
        given(clock.getZone()).willReturn(ZoneId.of("Asia/Seoul"));
        userId = nextId++;
        jdbcTemplate.update("insert into users (user_id, username, password_hash, account_status, is_agreed_term,"
                + " pin_hash) values (?, '신체경합', 'pw', 'active', true, 'pin')", userId);
        pool = Executors.newFixedThreadPool(3);
    }

    @AfterEach
    void cleanUp() {
        pool.shutdownNow();
        jdbcTemplate.update("delete from health_measurements where user_id = ?", userId);
        jdbcTemplate.update("delete from users where user_id = ?", userId);
    }

    // ---------- commits and DB defaults ----------

    @Test
    void aCommittedPostLeavesBmiNullAndUsesTheDbDefaults() throws Exception {
        MockHttpServletResponse response = perform(post(MEASUREMENTS), "{\"heightCm\":170,\"weightKg\":60}");
        assertThat(response.getStatus()).isEqualTo(201);
        long id = ((Number) JsonPath.read(response.getContentAsString(), "$.data.measurementId")).longValue();

        Map<String, Object> row = row(id); // read with SQL after the request's own transaction ended
        assertThat(row.get("bmi")).isNull();
        assertThat(row.get("source")).isEqualTo("manual");
        assertThat(row.get("is_estimated")).isEqualTo(false);
        assertThat(row.get("created_at")).isNotNull();
    }

    // ---------- the row lock ----------

    @Test
    void theLockedReadSendsForUpdateAndOtherWritersWait() throws Exception {
        long id = insertMeasurement("170", "60");
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Future<?> holder = pool.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(s -> {
            measurementRepository.findByIdAndUserIdForUpdate(id, userId).orElseThrow();
            locked.countDown();
            await(release);
        }));
        assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();

        assertThatThrownBy(() -> jdbcTemplate.queryForObject(
                "select measurement_id from health_measurements where measurement_id = ? for update nowait",
                Long.class, id)).hasMessageContaining("NOWAIT");
        Future<Integer> writer = pool.submit(() -> jdbcTemplate.update(
                "update health_measurements set body_fat_pct = 20 where measurement_id = ?", id));
        assertStillWaiting(writer);

        release.countDown();
        holder.get(10, TimeUnit.SECONDS);
        assertThat(writer.get(10, TimeUnit.SECONDS)).isOne();
    }

    /**
     * Why PATCH locks (first-step measurement): Hibernate's UPDATE writes every column, so an entity read without
     * the lock puts back the old weight that another transaction committed in between.
     */
    @Test
    void withoutTheLockASaveWritesBackAValueSomeoneElseChanged() throws Exception {
        long id = insertMeasurement("170", "60");
        CountDownLatch read = new CountDownLatch(1);
        CountDownLatch otherCommitted = new CountDownLatch(1);
        Future<?> stale = pool.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(s -> {
            HealthMeasurement m = measurementRepository.findById(id).orElseThrow(); // plain read, no lock
            read.countDown();
            await(otherCommitted);
            m.apply(null, new HealthMeasurement.MeasurementValues(new BigDecimal("171"), null, null, null));
        }));
        assertThat(read.await(10, TimeUnit.SECONDS)).isTrue();
        jdbcTemplate.update("update health_measurements set weight_kg = 65 where measurement_id = ?", id);
        otherCommitted.countDown();
        stale.get(10, TimeUnit.SECONDS);

        assertThat((BigDecimal) row(id).get("height_cm")).isEqualByComparingTo("171");
        assertThat((BigDecimal) row(id).get("weight_kg")).isEqualByComparingTo("60"); // 65 was lost
    }

    // ---------- concurrent PATCH ----------

    @Test
    void twoPatchesOnDifferentFieldsKeepBothChanges() throws Exception {
        long id = insertMeasurement("170", "60");
        Gate gate = holdTheFirstLockedRequest();

        Future<MockHttpServletResponse> height = pool.submit(() -> patchMeasurement(id, "{\"heightCm\":172}"));
        gate.awaitHeld();
        Future<MockHttpServletResponse> weight = pool.submit(() -> patchMeasurement(id, "{\"weightKg\":63}"));
        assertStillWaiting(weight);
        gate.release();

        assertThat(height.get(30, TimeUnit.SECONDS).getStatus()).isEqualTo(200);
        MockHttpServletResponse second = weight.get(30, TimeUnit.SECONDS);
        assertThat(second.getStatus()).isEqualTo(200);
        assertThat(second.getContentAsString()).contains("\"heightCm\":172.00,\"weightKg\":63.00");
        assertThat((BigDecimal) row(id).get("height_cm")).isEqualByComparingTo("172");
        assertThat((BigDecimal) row(id).get("weight_kg")).isEqualByComparingTo("63");
    }

    @Test
    void twoPatchesOnTheSameFieldEndWithTheLaterOne() throws Exception {
        long id = insertMeasurement("170", "60");
        Gate gate = holdTheFirstLockedRequest();

        Future<MockHttpServletResponse> first = pool.submit(() -> patchMeasurement(id, "{\"weightKg\":61}"));
        gate.awaitHeld();
        Future<MockHttpServletResponse> later = pool.submit(() -> patchMeasurement(id, "{\"weightKg\":62}"));
        assertStillWaiting(later);
        gate.release();

        assertThat(first.get(30, TimeUnit.SECONDS).getStatus()).isEqualTo(200);
        assertThat(later.get(30, TimeUnit.SECONDS).getStatus()).isEqualTo(200);
        assertThat((BigDecimal) row(id).get("weight_kg")).isEqualByComparingTo("62");
        assertThat((BigDecimal) row(id).get("height_cm")).isEqualByComparingTo("170");
    }

    @Test
    void theLockDoesNotHoldUpAnotherRowOrAPost() throws Exception {
        long locked = insertMeasurement("170", "60");
        long other = insertMeasurement("180", "80");
        Gate gate = holdTheFirstLockedRequest();

        Future<MockHttpServletResponse> holder = pool.submit(() -> patchMeasurement(locked, "{\"weightKg\":61}"));
        gate.awaitHeld();
        assertThat(patchMeasurement(other, "{\"weightKg\":81}").getStatus()).isEqualTo(200);
        assertThat(perform(post(MEASUREMENTS), "{\"weightKg\":59}").getStatus()).isEqualTo(201);
        gate.release();
        assertThat(holder.get(30, TimeUnit.SECONDS).getStatus()).isEqualTo(200);
    }

    // ---------- helpers ----------

    /** The first PATCH to take the row lock keeps it (its transaction stays open) until release(). */
    private Gate holdTheFirstLockedRequest() {
        Gate gate = new Gate();
        AtomicInteger calls = new AtomicInteger();
        Answer<?> real = Mockito.mockingDetails(measurementRepository).getMockCreationSettings().getDefaultAnswer();
        doAnswer(invocation -> {
            Object result = real.answer(invocation); // the lock is held from here on
            if (calls.getAndIncrement() == 0) {
                gate.held.countDown();
                assertThat(gate.release.await(10, TimeUnit.SECONDS)).isTrue();
            }
            return result;
        }).when(measurementRepository).findByIdAndUserIdForUpdate(anyLong(), anyLong());
        return gate;
    }

    private static final class Gate {
        private final CountDownLatch held = new CountDownLatch(1);
        private final CountDownLatch release = new CountDownLatch(1);

        void awaitHeld() throws InterruptedException {
            assertThat(held.await(10, TimeUnit.SECONDS)).isTrue();
        }

        void release() {
            release.countDown();
        }
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

    private MockHttpServletResponse patchMeasurement(long id, String body) throws Exception {
        return perform(patch(MEASUREMENTS + "/" + id).header("X-Pin-Token",
                jwtTokenProvider.createPinToken(userId, NOW)), body);
    }

    private MockHttpServletResponse perform(MockHttpServletRequestBuilder request, String body) throws Exception {
        return mockMvc.perform(request
                        .header(HttpHeaders.AUTHORIZATION,
                                "Bearer " + jwtTokenProvider.createAccessToken(userId, UserRole.USER, NOW))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn().getResponse();
    }

    private long insertMeasurement(String heightCm, String weightKg) {
        return new TransactionTemplate(transactionManager).execute(s -> {
            jdbcTemplate.update("insert into health_measurements (user_id, measured_at, height_cm, weight_kg)"
                    + " values (?, ?, ?, ?)", userId, MEASURED, new BigDecimal(heightCm), new BigDecimal(weightKg));
            return jdbcTemplate.queryForObject("select last_insert_id()", Long.class);
        });
    }

    private Map<String, Object> row(long id) {
        return jdbcTemplate.queryForMap("select * from health_measurements where measurement_id = ?", id);
    }
}
