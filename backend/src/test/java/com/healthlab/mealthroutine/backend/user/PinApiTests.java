package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.AccessTokenResult;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.jayway.jsonpath.JsonPath;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * PIN APIs (member unit 7, PIN7-1~11) with a movable fixed clock. Every test rolls back, so "committed" behaviour
 * (a failure count surviving the error response) is checked in PinRaceTests instead. Each test uses its own user
 * id because the PATCH attempt limiter counts per user for the whole run.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
@ExtendWith(OutputCaptureExtension.class)
class PinApiTests {

    private static final String PIN_PATH = "/api/v1/users/me/pin";
    private static final Instant NOW = Instant.parse("2026-11-23T03:00:00Z"); // 12:00 in Seoul
    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final String PASSWORD = "Passw0rd!";
    private static final String PIN = "482916";
    private static final String NEW_PIN = "058273";
    private static final AtomicLong NEXT_ID = new AtomicLong(9710L);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private EntityManager entityManager;

    @MockitoBean
    private Clock clock;

    private final AtomicReference<Instant> now = new AtomicReference<>(NOW);
    private long userId;

    @BeforeEach
    void fixClock() {
        given(clock.instant()).willAnswer(invocation -> now.get());
        given(clock.getZone()).willReturn(ZONE);
        userId = NEXT_ID.getAndIncrement();
    }

    // ---------- PUT ----------

    @Test
    void putSetsThePinAndReturnsAPinToken() throws Exception {
        insertLocalUser(null, 0, null);

        String body = perform(put(PIN_PATH), "{\"newPin\":\"" + PIN + "\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.expiresIn").value(600))
                .andReturn().getResponse().getContentAsString();

        assertThat(passwordEncoder.matches(PIN, pinHash())).isTrue();
        AccessTokenResult token = jwtTokenProvider.parsePinToken(JsonPath.read(body, "$.data.pinToken"));
        assertThat(token.status()).isEqualTo(AccessTokenResult.Status.VALID);
        assertThat(token.userId()).isEqualTo(userId);
        perform(get("/api/v1/users/me"), null).andExpect(jsonPath("$.data.pinRegistered").value(true));
    }

    @Test
    void aSecondPutIs409AndKeepsThePin() throws Exception {
        insertLocalUser(PIN, 0, null);
        String before = pinHash();

        perform(put(PIN_PATH), "{\"newPin\":\"" + NEW_PIN + "\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("PIN_ALREADY_SET"))
                .andExpect(jsonPath("$.data").doesNotExist());
        assertThat(pinHash()).isEqualTo(before);
    }

    @Test
    void badPinFormatsAre400AndChangeNothing() throws Exception {
        insertLocalUser(null, 0, null);
        String[] bodies = {
            "{\"newPin\":\"12345\"}", "{\"newPin\":\"1234567\"}", "{\"newPin\":\" 123456\"}",
            "{\"newPin\":\"12345a\"}", "{\"newPin\":\"１２３４５６\"}", "{\"newPin\":123456}", "{\"newPin\":null}",
            "{}", "{\"newPin\":\"\"}", "{\"newPin\":[\"123456\"]}",
        };
        for (String body : bodies) {
            perform(put(PIN_PATH), body)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));
            assertThat(pinHash()).as(body).isNull();
        }
        perform(post(PIN_PATH + "/verify"), "{\"pin\":123456}").andExpect(status().isBadRequest());
    }

    // ---------- status ----------

    @Test
    void statusShowsRegisteredAndLock() throws Exception {
        insertLocalUser(null, 0, null);
        perform(get(PIN_PATH + "/status"), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.registered").value(false))
                .andExpect(jsonPath("$.data.locked").value(false))
                .andExpect(jsonPath("$.data.lockedUntil").doesNotExist());

        LocalDateTime until = LocalDateTime.of(2026, 11, 23, 12, 10);
        jdbcTemplate.update("update users set pin_hash = 'h', pin_failed_count = 5, pin_locked_until = ?"
                + " where user_id = ?", until, userId);
        // This test is one transaction, so the first request's entity is still cached; a real request reads anew.
        entityManager.clear();
        perform(get(PIN_PATH + "/status"), null)
                .andExpect(jsonPath("$.data.registered").value(true))
                .andExpect(jsonPath("$.data.locked").value(true))
                .andExpect(jsonPath("$.data.lockedUntil").value("2026-11-23T12:10:00"));

        now.set(NOW.plus(Duration.ofMinutes(10))); // exactly lockedUntil: the lock is over
        perform(get(PIN_PATH + "/status"), null)
                .andExpect(jsonPath("$.data.locked").value(false))
                .andExpect(jsonPath("$.data.lockedUntil").doesNotExist());
    }

    // ---------- verify ----------

    @Test
    void verifySucceedsAndResetsFailures() throws Exception {
        insertLocalUser(PIN, 3, null);

        String body = verify(PIN).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.expiresIn").value(600))
                .andReturn().getResponse().getContentAsString();

        assertThat(jwtTokenProvider.parsePinToken(JsonPath.read(body, "$.data.pinToken")).userId()).isEqualTo(userId);
        assertThat(failures()).isZero();
    }

    @Test
    void fiveWrongPinsInARowLockForTenMinutes() throws Exception {
        insertLocalUser(PIN, 0, null);

        for (int remaining = 4; remaining >= 1; remaining--) {
            String body = verify(NEW_PIN).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errorCode").value("PIN_INVALID"))
                    .andExpect(jsonPath("$.data.remainingAttempts").value(remaining))
                    .andExpect(header().doesNotExist(HttpHeaders.WWW_AUTHENTICATE))
                    .andReturn().getResponse().getContentAsString();
            // jsonPath doesNotExist() also passes for a null value, so the key itself is checked.
            assertThat(body).doesNotContain("lockedUntil");
        }
        String lockedBody = verify(NEW_PIN).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("PIN_LOCKED"))
                .andExpect(jsonPath("$.data.lockedUntil").value("2026-11-23T12:10:00"))
                .andReturn().getResponse().getContentAsString();
        assertThat(lockedBody).doesNotContain("remainingAttempts");
        assertThat(failures()).isEqualTo(5);

        // Locked: even the right PIN is refused, and nothing changes.
        now.set(NOW.plus(Duration.ofMinutes(10)).minusSeconds(1));
        verify(PIN).andExpect(status().isForbidden()).andExpect(jsonPath("$.errorCode").value("PIN_LOCKED"));
        assertThat(failures()).isEqualTo(5);
    }

    /** A clock with a fraction of a second: the response shows exactly what DATETIME stores, rounded up. */
    @Test
    void theLockEndIsAWholeSecondAndEqualsTheStoredValue() throws Exception {
        insertLocalUser(PIN, 4, null);
        now.set(NOW.plusMillis(83).plusNanos(577_000)); // 12:00:00.083577

        verify(NEW_PIN).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.data.lockedUntil").value("2026-11-23T12:10:01"));
        assertThat(row().get("pin_locked_until").toString()).startsWith("2026-11-23").contains("12:10:01");
        perform(get(PIN_PATH + "/status"), null).andExpect(jsonPath("$.data.lockedUntil").value("2026-11-23T12:10:01"));

        now.set(NOW.plus(Duration.ofMinutes(10)).plusMillis(999)); // 12:10:00.999 is still locked
        verify(PIN).andExpect(status().isForbidden());
    }

    @Test
    void afterTheLockEndsTheCountStartsAgain() throws Exception {
        insertLocalUser(PIN, 5, LocalDateTime.of(2026, 11, 23, 12, 10));
        now.set(NOW.plus(Duration.ofMinutes(10))); // exactly lockedUntil

        verify(NEW_PIN).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.remainingAttempts").value(4));
        assertThat(failures()).isEqualTo(1);
        assertThat(row().get("pin_locked_until")).isNull();

        verify(PIN).andExpect(status().isOk());
        assertThat(failures()).isZero();
    }

    @Test
    void theRightPinAfterAnEndedLockSucceeds() throws Exception {
        insertLocalUser(PIN, 5, LocalDateTime.of(2026, 11, 23, 12, 10));
        now.set(NOW.plus(Duration.ofMinutes(11)));

        verify(PIN).andExpect(status().isOk());
        assertThat(failures()).isZero();
        assertThat(row().get("pin_locked_until")).isNull();
    }

    @Test
    void verifyWithoutAPinIs403() throws Exception {
        insertLocalUser(null, 0, null);
        verify(PIN).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("PIN_NOT_REGISTERED"))
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    // ---------- PATCH (PIN7-7) ----------

    @Test
    void changeWithTheCurrentPin() throws Exception {
        insertLocalUser(PIN, 2, null);
        change("{\"newPin\":\"" + NEW_PIN + "\",\"currentPin\":\"" + PIN + "\"}").andExpect(status().isNoContent());
        assertThat(passwordEncoder.matches(NEW_PIN, pinHash())).isTrue();
        assertThat(failures()).isZero();
    }

    @Test
    void aWrongCurrentPinCountsAsAPinFailure() throws Exception {
        insertLocalUser(PIN, 0, null);
        String before = pinHash();
        change("{\"newPin\":\"" + NEW_PIN + "\",\"currentPin\":\"000000\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("PIN_INVALID"))
                .andExpect(jsonPath("$.data.remainingAttempts").value(4));
        assertThat(pinHash()).isEqualTo(before);
        assertThat(failures()).isEqualTo(1);
    }

    @Test
    void currentPinIsRefusedWhileLocked() throws Exception {
        insertLocalUser(PIN, 5, LocalDateTime.of(2026, 11, 23, 12, 5));
        String before = pinHash();
        change("{\"newPin\":\"" + NEW_PIN + "\",\"currentPin\":\"" + PIN + "\"}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("PIN_LOCKED"))
                .andExpect(jsonPath("$.data.lockedUntil").value("2026-11-23T12:05:00"));
        assertThat(pinHash()).isEqualTo(before);
    }

    @Test
    void currentPasswordRecoversEvenWhileLocked() throws Exception {
        insertLocalUser(PIN, 5, LocalDateTime.of(2026, 11, 23, 12, 5));
        change("{\"newPin\":\"" + NEW_PIN + "\",\"currentPassword\":\"" + PASSWORD + "\"}")
                .andExpect(status().isNoContent());
        assertThat(passwordEncoder.matches(NEW_PIN, pinHash())).isTrue();
        assertThat(failures()).isZero();
        assertThat(row().get("pin_locked_until")).isNull();
        verify(NEW_PIN).andExpect(status().isOk());
    }

    @Test
    void aWrongCurrentPasswordIs400AndIsNotAPinFailure() throws Exception {
        insertLocalUser(PIN, 2, null);
        String before = pinHash();
        change("{\"newPin\":\"" + NEW_PIN + "\",\"currentPassword\":\"Wrong0000!\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("CURRENT_PASSWORD_MISMATCH"))
                .andExpect(jsonPath("$.data").doesNotExist());
        assertThat(pinHash()).isEqualTo(before);
        assertThat(failures()).isEqualTo(2);
    }

    @Test
    void aLocalAccountMustSendAProof() throws Exception {
        insertLocalUser(PIN, 0, null);
        String before = pinHash();
        change("{\"newPin\":\"" + NEW_PIN + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));
        change("{\"newPin\":\"" + NEW_PIN + "\",\"currentPin\":\"" + PIN + "\",\"currentPassword\":\"" + PASSWORD + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));
        change("{\"newPin\":\"" + NEW_PIN + "\",\"currentPassword\":\"\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));
        change("{\"newPin\":\"" + NEW_PIN + "\",\"currentPin\":\"12345\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));
        change("{\"newPin\":\"1\",\"currentPin\":\"" + PIN + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));
        assertThat(pinHash()).isEqualTo(before);
        assertThat(failures()).isZero();
    }

    @Test
    void aSocialOnlyAccountMayResetWithoutAProofButNotWithAPassword() throws Exception {
        insertUser(null, PIN, 0, null);
        change("{\"newPin\":\"" + NEW_PIN + "\",\"currentPassword\":\"" + PASSWORD + "\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("PASSWORD_NOT_SET"));
        change("{\"newPin\":\"" + NEW_PIN + "\",\"currentPin\":\"000000\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("PIN_INVALID"));

        change("{\"newPin\":\"" + NEW_PIN + "\"}").andExpect(status().isNoContent()); // Q-24
        assertThat(passwordEncoder.matches(NEW_PIN, pinHash())).isTrue();
        assertThat(failures()).isZero();
    }

    @Test
    void changeWithoutAPinIs403() throws Exception {
        insertLocalUser(null, 0, null);
        change("{\"newPin\":\"" + NEW_PIN + "\",\"currentPassword\":\"" + PASSWORD + "\"}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("PIN_NOT_REGISTERED"));
        assertThat(pinHash()).isNull();
    }

    @Test
    void theSixthChangeInAMinuteIs429() throws Exception {
        insertLocalUser(PIN, 0, null);
        for (int i = 0; i < 5; i++) {
            change("{\"newPin\":\"" + NEW_PIN + "\",\"currentPassword\":\"Wrong0000!\"}")
                    .andExpect(status().isBadRequest());
        }
        change("{\"newPin\":\"" + NEW_PIN + "\",\"currentPassword\":\"" + PASSWORD + "\"}")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.errorCode").value("TOO_MANY_REQUESTS"))
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER));
        assertThat(passwordEncoder.matches(PIN, pinHash())).isTrue();
        // verify and status are not limited by this
        verify(PIN).andExpect(status().isOk());
    }

    // ---------- tokens, login and other errors ----------

    @Test
    void aPinTokenIsNotALoginToken() throws Exception {
        insertLocalUser(PIN, 0, null);
        String pinToken = jwtTokenProvider.createPinToken(userId, NOW);
        mockMvc.perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + pinToken))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("INVALID_TOKEN"));
    }

    @Test
    void everyPinApiNeedsLogin() throws Exception {
        mockMvc.perform(put(PIN_PATH).contentType(MediaType.APPLICATION_JSON).content("{\"newPin\":\"123456\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get(PIN_PATH + "/status")).andExpect(status().isUnauthorized());
        mockMvc.perform(post(PIN_PATH + "/verify").contentType(MediaType.APPLICATION_JSON).content("{\"pin\":\"123456\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(patch(PIN_PATH).contentType(MediaType.APPLICATION_JSON).content("{\"newPin\":\"123456\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    /** PIN7-3 regression: only the two PIN errors carry data; every other error body is unchanged. */
    @Test
    void otherErrorsStillHaveNoData() throws Exception {
        insertLocalUser(PIN, 0, null);
        String passwordError = mockMvc.perform(patch("/api/v1/users/me/password").header(HttpHeaders.AUTHORIZATION, bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"Wrong0000!\",\"newPassword\":\"NewPassw0rd#\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("CURRENT_PASSWORD_MISMATCH"))
                .andReturn().getResponse().getContentAsString();
        String loginError = mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nobody@example.com\",\"password\":\"Passw0rd!\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("LOGIN_FAILED"))
                .andReturn().getResponse().getContentAsString();
        String jsonError = perform(post(PIN_PATH + "/verify"), "{broken")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"))
                .andReturn().getResponse().getContentAsString();
        String notRegistered = mockMvc.perform(put(PIN_PATH).header(HttpHeaders.AUTHORIZATION, bearer())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"newPin\":\"" + NEW_PIN + "\"}"))
                .andExpect(status().isConflict())
                .andReturn().getResponse().getContentAsString();
        // The key itself must be absent (jsonPath doesNotExist() would also accept "data": null).
        for (String body : new String[] {passwordError, loginError, jsonError, notRegistered}) {
            assertThat(body).doesNotContain("\"data\"");
        }
    }

    @Test
    void noPinOrTokenReachesTheLog(CapturedOutput output) throws Exception {
        insertLocalUser(null, 0, null);
        // MockMvc prints a failed test's request (with its PIN) to the console, so only this test's output counts.
        int start = output.getAll().length();
        String body = perform(put(PIN_PATH), "{\"newPin\":\"" + PIN + "\"}").andReturn().getResponse()
                .getContentAsString();
        verify(NEW_PIN);
        change("{\"newPin\":\"" + NEW_PIN + "\",\"currentPin\":\"" + PIN + "\"}");
        change("{\"newPin\":\"" + PIN + "\",\"currentPassword\":\"" + PASSWORD + "\"}");

        String pinToken = JsonPath.read(body, "$.data.pinToken");
        assertThat(output.getAll().substring(start)).contains("PIN set: userId=" + userId)
                .doesNotContain(PIN).doesNotContain(NEW_PIN).doesNotContain(PASSWORD).doesNotContain(pinToken);
    }

    // ---------- helpers ----------

    private void insertLocalUser(String pin, int failures, LocalDateTime lockedUntil) {
        insertUser(passwordEncoder.encode(PASSWORD), pin, failures, lockedUntil);
    }

    private void insertUser(String passwordHash, String pin, int failures, LocalDateTime lockedUntil) {
        jdbcTemplate.update("insert into users (user_id, email, username, password_hash, account_status, is_agreed_term,"
                + " pin_hash, pin_failed_count, pin_locked_until) values (?, ?, '핀회원', ?, 'active', true, ?, ?, ?)",
                userId, "pin" + userId + "@example.com", passwordHash, pin == null ? null : passwordEncoder.encode(pin),
                failures, lockedUntil);
    }

    private String bearer() {
        return "Bearer " + jwtTokenProvider.createAccessToken(userId, UserRole.USER, now.get());
    }

    private ResultActions perform(MockHttpServletRequestBuilder request, String body) throws Exception {
        request.header(HttpHeaders.AUTHORIZATION, bearer());
        if (body != null) {
            request.contentType(MediaType.APPLICATION_JSON).content(body);
        }
        return mockMvc.perform(request);
    }

    private ResultActions verify(String pin) throws Exception {
        return perform(post(PIN_PATH + "/verify"), "{\"pin\":\"" + pin + "\"}");
    }

    private ResultActions change(String body) throws Exception {
        return perform(patch(PIN_PATH), body);
    }

    private Map<String, Object> row() {
        return jdbcTemplate.queryForMap("select pin_hash, pin_failed_count, pin_locked_until from users"
                + " where user_id = ?", userId);
    }

    private String pinHash() {
        return (String) row().get("pin_hash");
    }

    private int failures() {
        return ((Number) row().get("pin_failed_count")).intValue();
    }
}
