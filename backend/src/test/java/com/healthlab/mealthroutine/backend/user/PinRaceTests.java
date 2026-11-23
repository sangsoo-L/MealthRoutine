package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyByte;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * PIN races and commits (PIN7-4, PIN7-10, PIN7-11, PIN7-12). No test-level @Transactional: each request commits
 * or rolls back on its own, like on a real server. The user row is committed before each test and deleted after.
 * <ul>
 *   <li>"At once" tests meet at a barrier right before the row lock is requested, never inside it, so the test
 *   threads do not wait for each other while one holds the lock.</li>
 *   <li>"In this order" tests hold the first request inside the lock with latches (lockHeld / release), start the
 *   second one, check that it is still waiting, then release.</li>
 * </ul>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PinRaceTests {

    private static final String PIN_PATH = "/api/v1/users/me/pin";
    private static final Instant NOW = Instant.parse("2026-11-23T03:00:00Z"); // 12:00 in Seoul
    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final String PASSWORD = "Passw0rd!";
    private static final String NEW_PASSWORD = "NewPassw0rd#A";
    private static final String PIN = "482916";
    private static final String NEW_PIN = "058273";
    private static final String WRONG_PIN = "111111";
    private static long nextId = 9760L;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockitoSpyBean
    private PasswordEncoder passwordEncoder;

    @MockitoSpyBean
    private UserRepository userRepository;

    @MockitoSpyBean
    private JwtTokenProvider jwtTokenProvider;

    @MockitoBean
    private Clock clock;

    private final AtomicReference<Instant> now = new AtomicReference<>(NOW);
    private long userId;
    private ExecutorService pool;

    @BeforeEach
    void setUp() {
        given(clock.instant()).willAnswer(invocation -> now.get());
        given(clock.getZone()).willReturn(ZONE);
        userId = nextId++; // the PATCH attempt limiter counts per user for the whole run
        pool = Executors.newFixedThreadPool(10);
    }

    @AfterEach
    void cleanUp() {
        pool.shutdownNow();
        jdbcTemplate.update("delete from users where user_id = ?", userId);
    }

    // ---------- commits ----------

    @Test
    void aFailureCountIsCommittedAlthoughTheResponseIsAnError() throws Exception {
        insertUser(PIN, 0, null);

        assertThat(perform(verifyRequest(WRONG_PIN)).getStatus()).isEqualTo(400);
        assertThat(failures()).isEqualTo(1); // read with SQL after the request's own transaction ended

        jdbcTemplate.update("update users set pin_failed_count = 4 where user_id = ?", userId);
        assertThat(perform(verifyRequest(WRONG_PIN)).getStatus()).isEqualTo(403);
        assertThat(failures()).isEqualTo(5);
        assertThat(row().get("pin_locked_until")).isNotNull();
    }

    // ---------- at once ----------

    @Test
    void tenWrongPinsAtOnceStopAtFive() throws Exception {
        insertUser(PIN, 0, null);
        meetBeforeTheLock(10);
        clearInvocations(passwordEncoder);

        List<Future<MockHttpServletResponse>> futures = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            futures.add(pool.submit(() -> perform(verifyRequest(WRONG_PIN))));
        }
        List<Integer> statuses = new ArrayList<>();
        for (Future<MockHttpServletResponse> future : futures) {
            statuses.add(future.get(30, TimeUnit.SECONDS).getStatus());
        }

        statuses.sort(null);
        assertThat(statuses).containsExactly(400, 400, 400, 400, 403, 403, 403, 403, 403, 403);
        assertThat(failures()).isEqualTo(5);
        assertThat(row().get("pin_locked_until")).isNotNull();
        verify(passwordEncoder, times(5)).matches(eq(WRONG_PIN), anyString()); // no BCrypt once locked
    }

    @Test
    void twoFirstPinsAtOnceLetExactlyOneWin() throws Exception {
        insertUser(null, 0, null);
        meetBeforeTheLock(2);

        Future<MockHttpServletResponse> first = pool.submit(() -> perform(put(PIN_PATH), "{\"newPin\":\"" + PIN + "\"}"));
        Future<MockHttpServletResponse> second = pool.submit(() -> perform(put(PIN_PATH), "{\"newPin\":\"" + NEW_PIN + "\"}"));
        List<MockHttpServletResponse> responses = List.of(first.get(30, TimeUnit.SECONDS), second.get(30, TimeUnit.SECONDS));

        List<Integer> statuses = new ArrayList<>(responses.stream().map(MockHttpServletResponse::getStatus).toList());
        statuses.sort(null);
        assertThat(statuses).containsExactly(200, 409);
        String winner = responses.get(0).getStatus() == 200 ? PIN : NEW_PIN;
        assertThat(passwordEncoder.matches(winner, pinHash())).isTrue();
    }

    // ---------- in this order ----------

    /** A success that resets the count does not lose a failure that waited behind it, and vice versa. */
    @Test
    void aFailureAfterASuccessIsCountedFromZero() throws Exception {
        insertUser(PIN, 3, null);
        Gate gate = holdTheFirstLockedRequest();

        Future<MockHttpServletResponse> success = pool.submit(() -> perform(verifyRequest(PIN)));
        gate.awaitHeld();
        Future<MockHttpServletResponse> failure = pool.submit(() -> perform(verifyRequest(WRONG_PIN)));
        assertStillWaiting(failure);
        gate.release();

        assertThat(success.get(30, TimeUnit.SECONDS).getStatus()).isEqualTo(200);
        MockHttpServletResponse failed = failure.get(30, TimeUnit.SECONDS);
        assertThat(failed.getStatus()).isEqualTo(400);
        assertThat(failed.getContentAsString()).contains("\"remainingAttempts\":4");
        assertThat(failures()).isEqualTo(1);
    }

    /**
     * A verify that waited while a PIN change committed is judged against the new PIN and its fresh count (0),
     * never the old PIN or the old count (3).
     */
    @Test
    void aWaitingVerifyUsesTheNewPinState() throws Exception {
        insertUser(PIN, 3, null);
        Gate gate = holdTheFirstLockedRequest();

        Future<MockHttpServletResponse> change = pool.submit(() -> perform(patch(PIN_PATH),
                "{\"newPin\":\"" + NEW_PIN + "\",\"currentPassword\":\"" + PASSWORD + "\"}"));
        gate.awaitHeld();
        Future<MockHttpServletResponse> staleVerify = pool.submit(() -> perform(verifyRequest(PIN)));
        assertStillWaiting(staleVerify);
        gate.release();

        assertThat(change.get(30, TimeUnit.SECONDS).getStatus()).isEqualTo(204);
        MockHttpServletResponse verified = staleVerify.get(30, TimeUnit.SECONDS);
        assertThat(verified.getStatus()).isEqualTo(400);
        assertThat(verified.getContentAsString()).contains("\"remainingAttempts\":4");
        assertThat(passwordEncoder.matches(NEW_PIN, pinHash())).isTrue();
        assertThat(failures()).isEqualTo(1);
        verify(jwtTokenProvider, times(0)).createPinToken(anyLong(), any());
    }

    /** ① The password change commits first: recovery with the old password then fails and the PIN stays. */
    @Test
    void recoveryWithAPasswordChangedMeanwhileFails() throws Exception {
        insertUser(PIN, 0, null);
        String before = pinHash();
        // Pause the recovery right before it asks for the lock, change the password, then let it continue.
        CountDownLatch beforeLock = new CountDownLatch(1);
        CountDownLatch passwordChanged = new CountDownLatch(1);
        Answer<?> real = realAnswer(userRepository);
        doAnswer(invocation -> {
            beforeLock.countDown();
            assertThat(passwordChanged.await(10, TimeUnit.SECONDS)).isTrue();
            return real.answer(invocation);
        }).when(userRepository).findByIdForUpdate(anyLong());

        Future<MockHttpServletResponse> recovery = pool.submit(() -> perform(patch(PIN_PATH),
                "{\"newPin\":\"" + NEW_PIN + "\",\"currentPassword\":\"" + PASSWORD + "\"}"));
        assertThat(beforeLock.await(10, TimeUnit.SECONDS)).isTrue();
        assertThat(perform(patch("/api/v1/users/me/password"),
                "{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"" + NEW_PASSWORD + "\"}").getStatus())
                .isEqualTo(204);
        passwordChanged.countDown();

        MockHttpServletResponse response = recovery.get(30, TimeUnit.SECONDS);
        assertThat(response.getStatus()).isEqualTo(400);
        assertThat(response.getContentAsString()).contains("CURRENT_PASSWORD_MISMATCH");
        assertThat(pinHash()).isEqualTo(before);
    }

    /** ② The recovery holds the lock first: the password change waits, then both succeed in that order. */
    @Test
    void aPasswordChangeWaitsForARecoveryThatHoldsTheLock() throws Exception {
        insertUser(PIN, 5, LocalDateTime.of(2026, 11, 23, 12, 5));
        Gate gate = holdTheFirstLockedRequest();

        Future<MockHttpServletResponse> recovery = pool.submit(() -> perform(patch(PIN_PATH),
                "{\"newPin\":\"" + NEW_PIN + "\",\"currentPassword\":\"" + PASSWORD + "\"}"));
        gate.awaitHeld();
        Future<MockHttpServletResponse> passwordChange = pool.submit(() -> perform(patch("/api/v1/users/me/password"),
                "{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"" + NEW_PASSWORD + "\"}"));
        assertStillWaiting(passwordChange);
        gate.release();

        assertThat(recovery.get(30, TimeUnit.SECONDS).getStatus()).isEqualTo(204);
        assertThat(passwordChange.get(30, TimeUnit.SECONDS).getStatus()).isEqualTo(204);
        assertThat(passwordEncoder.matches(NEW_PIN, pinHash())).isTrue();
        assertThat(failures()).isZero();
        assertThat(passwordEncoder.matches(NEW_PASSWORD, (String) row().get("password_hash"))).isTrue();
    }

    /**
     * The lock ends while a request waits for the row lock. The time is read after the lock is held, so the
     * waiting request sees the lock as over and counts from zero.
     */
    @Test
    void aRequestThatWaitedPastTheEndOfTheLockSeesItAsOver() throws Exception {
        LocalDateTime lockEnd = LocalDateTime.of(2026, 11, 23, 12, 10);
        insertUser(PIN, 5, lockEnd);
        now.set(NOW.plus(Duration.ofMinutes(9))); // 12:09, still locked
        Gate gate = holdTheFirstLockedRequest();

        Future<MockHttpServletResponse> holder = pool.submit(() -> perform(lockHolder()));
        gate.awaitHeld();
        Future<MockHttpServletResponse> waiting = pool.submit(() -> perform(verifyRequest(WRONG_PIN)));
        assertStillWaiting(waiting);
        now.set(NOW.plus(Duration.ofMinutes(10))); // 12:10 = lockEnd while the second request waits
        gate.release();

        holder.get(30, TimeUnit.SECONDS);
        MockHttpServletResponse response = waiting.get(30, TimeUnit.SECONDS);
        assertThat(response.getStatus()).isEqualTo(400);
        assertThat(response.getContentAsString()).contains("\"remainingAttempts\":4");
        assertThat(failures()).isEqualTo(1);
        assertThat(row().get("pin_locked_until")).isNull();
    }

    // ---------- unexpected failures roll back ----------

    @Test
    void anUnexpectedZeroRowUpdateIs500AndRollsBack() throws Exception {
        insertUser(PIN, 2, null);
        doReturn(0).when(userRepository).savePinAttempts(anyLong(), anyByte(), any());

        MockHttpServletResponse response = perform(verifyRequest(WRONG_PIN));

        assertThat(response.getStatus()).isEqualTo(500);
        assertThat(response.getContentAsString()).contains("INTERNAL_ERROR").doesNotContain("remainingAttempts");
        assertThat(failures()).isEqualTo(2);
    }

    @Test
    void aDbFailureWhileSavingANewPinIs500AndKeepsTheOldPin() throws Exception {
        insertUser(PIN, 3, null);
        String before = pinHash();
        doThrow(new IllegalStateException("simulated DB failure")).when(userRepository).savePin(anyLong(), anyString());

        MockHttpServletResponse response = perform(patch(PIN_PATH),
                "{\"newPin\":\"" + NEW_PIN + "\",\"currentPin\":\"" + PIN + "\"}");

        assertThat(response.getStatus()).isEqualTo(500);
        assertThat(pinHash()).isEqualTo(before);
        assertThat(failures()).isEqualTo(3); // the reset from the correct currentPin is rolled back too
    }

    /** PIN7-11: a PUT whose PIN token cannot be made leaves no PIN behind. */
    @Test
    void aPutWhoseTokenFailsSavesNoPin() throws Exception {
        insertUser(null, 0, null);
        doThrow(new IllegalStateException("simulated token failure"))
                .when(jwtTokenProvider).createPinToken(anyLong(), any());

        MockHttpServletResponse response = perform(put(PIN_PATH), "{\"newPin\":\"" + PIN + "\"}");

        assertThat(response.getStatus()).isEqualTo(500);
        assertThat(pinHash()).isNull();
        verify(userRepository, atLeastOnce()).savePin(anyLong(), anyString()); // it was saved, then rolled back
    }

    // ---------- helpers ----------

    /** All n requests wait here right before asking for the row lock, then go together. */
    private void meetBeforeTheLock(int n) {
        CyclicBarrier barrier = new CyclicBarrier(n);
        Answer<?> real = realAnswer(userRepository);
        doAnswer(invocation -> {
            barrier.await(10, TimeUnit.SECONDS);
            return real.answer(invocation);
        }).when(userRepository).findByIdForUpdate(anyLong());
    }

    /** The first request to take the row lock keeps it (its transaction stays open) until release(). */
    private Gate holdTheFirstLockedRequest() {
        Gate gate = new Gate();
        AtomicInteger calls = new AtomicInteger();
        Answer<?> real = realAnswer(userRepository);
        doAnswer(invocation -> {
            Object result = real.answer(invocation); // the lock is held from here on
            if (calls.getAndIncrement() == 0) {
                gate.held.countDown();
                assertThat(gate.release.await(10, TimeUnit.SECONDS)).isTrue();
            }
            return result;
        }).when(userRepository).findByIdForUpdate(anyLong());
        return gate;
    }

    /**
     * A request that takes the row lock and is held in it (status does not lock, so a verify with the right PIN).
     * Its own result is not checked: it reads the clock after release, like the waiting request.
     */
    private MockHttpServletRequestBuilder lockHolder() {
        return withBody(post(PIN_PATH + "/verify"), "{\"pin\":\"" + PIN + "\"}");
    }

    private static void assertStillWaiting(Future<?> future) throws InterruptedException {
        Thread.sleep(300); // only to show it does not finish while the lock is held; the order is set by latches
        assertThat(future.isDone()).isFalse();
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

    /** The spy wraps a Spring Data proxy, so callRealMethod() is not possible; its default answer runs the real one. */
    private static Answer<?> realAnswer(Object spy) {
        return Mockito.mockingDetails(spy).getMockCreationSettings().getDefaultAnswer();
    }

    private void insertUser(String pin, int failures, LocalDateTime lockedUntil) {
        jdbcTemplate.update("insert into users (user_id, email, username, password_hash, account_status, is_agreed_term,"
                + " pin_hash, pin_failed_count, pin_locked_until) values (?, ?, '핀경합', ?, 'active', true, ?, ?, ?)",
                userId, "pinrace" + userId + "@example.com", passwordEncoder.encode(PASSWORD),
                pin == null ? null : passwordEncoder.encode(pin), failures, lockedUntil);
    }

    private MockHttpServletRequestBuilder verifyRequest(String pin) {
        return withBody(post(PIN_PATH + "/verify"), "{\"pin\":\"" + pin + "\"}");
    }

    private MockHttpServletRequestBuilder withBody(MockHttpServletRequestBuilder request, String body) {
        return request.header(HttpHeaders.AUTHORIZATION,
                        "Bearer " + jwtTokenProvider.createAccessToken(userId, UserRole.USER, now.get()))
                .contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private MockHttpServletResponse perform(MockHttpServletRequestBuilder request, String body) throws Exception {
        return perform(withBody(request, body));
    }

    private MockHttpServletResponse perform(MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request).andReturn().getResponse();
    }

    private Map<String, Object> row() {
        return jdbcTemplate.queryForMap("select pin_hash, pin_failed_count, pin_locked_until, password_hash"
                + " from users where user_id = ?", userId);
    }

    private String pinHash() {
        return (String) row().get("pin_hash");
    }

    private int failures() {
        return ((Number) row().get("pin_failed_count")).intValue();
    }
}
