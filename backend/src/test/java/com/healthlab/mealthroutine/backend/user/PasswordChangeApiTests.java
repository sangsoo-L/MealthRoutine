package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.healthlab.mealthroutine.backend.user.jwt.RefreshTokens;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
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
 * PATCH /api/v1/users/me/password (DC-19, PWCHG6-1~2) with a fixed clock. Every test rolls back; rows are checked
 * with SQL. Users get new ids per test (the in-memory attempt limiter counts per user for the whole test run).
 * Races and a DB failure are in PasswordChangeRaceTests.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class PasswordChangeApiTests {

    private static final String PASSWORD = "/api/v1/users/me/password";
    private static final String LOGIN = "/api/v1/auth/login";
    private static final String REFRESH = "/api/v1/auth/token/refresh";
    private static final String OLD_PASSWORD = "Passw0rd!";
    private static final String NEW_PASSWORD = "NewPassw0rd#";
    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final Instant NOW = Instant.parse("2026-11-23T03:00:00Z");
    private static long nextId = 9620L;

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

    private long a;
    private long b;
    private String oldHash;

    @BeforeEach
    void setUp() {
        given(clock.instant()).willReturn(NOW);
        given(clock.getZone()).willReturn(ZONE);
        oldHash = passwordEncoder.encode(OLD_PASSWORD);
        a = nextId++;
        b = nextId++;
        insertUser(a, oldHash);
        insertUser(b, oldHash);
    }

    @Test
    void successChangesTheHashEndsRefreshLoginsAndDeletesTheCookie() throws Exception {
        String oldRefresh = RefreshTokens.generate();
        jdbcTemplate.update("update users set refresh_token_hash = ?, refresh_token_expires_at = ? where user_id = ?",
                RefreshTokens.hash(oldRefresh), LocalDateTime.ofInstant(NOW, ZONE).plusDays(3), a);

        change(a, OLD_PASSWORD, NEW_PASSWORD)
                .andExpect(status().isNoContent())
                .andExpect(header().string(HttpHeaders.SET_COOKIE, org.hamcrest.Matchers.allOf(
                        org.hamcrest.Matchers.startsWith("refresh_token=;"),
                        org.hamcrest.Matchers.containsString("Path=/api/v1/auth"),
                        org.hamcrest.Matchers.containsString("Max-Age=0"),
                        org.hamcrest.Matchers.containsString("HttpOnly"),
                        org.hamcrest.Matchers.containsString("Secure"),
                        org.hamcrest.Matchers.containsString("SameSite=Lax"))));

        Map<String, Object> row = row(a);
        assertThat(passwordEncoder.matches(NEW_PASSWORD, (String) row.get("password_hash"))).isTrue();
        assertThat(row.get("refresh_token_hash")).isNull();
        assertThat(row.get("refresh_token_expires_at")).isNull();

        // The old refresh cookie no longer works; the new password logs in, the old one does not.
        perform(post(REFRESH).header("X-Requested-With", "XMLHttpRequest").cookie(new Cookie("refresh_token", oldRefresh)))
                .andExpect(status().isUnauthorized());
        login(a, NEW_PASSWORD).andExpect(status().isOk());
        login(a, OLD_PASSWORD).andExpect(status().isUnauthorized());
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "{\"currentPassword\":\"Passw0rd!\",\"newPassword\":\"Sh0rt!\"}",
        "{\"currentPassword\":\"Passw0rd!\",\"newPassword\":\"NoDigits!!\"}",
        "{\"currentPassword\":\"Passw0rd!\",\"newPassword\":\"N0Symbols1\"}",
        "{\"currentPassword\":\"Passw0rd!\",\"newPassword\":\"12345678!\"}",
        "{\"currentPassword\":\"Passw0rd!\",\"newPassword\":\"With Space1!\"}",
        "{\"currentPassword\":\"Passw0rd!\",\"newPassword\":\"한글비번1234!\"}",
        "{\"currentPassword\":\"Passw0rd!\",\"newPassword\":\"A1!aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}",
        "{\"currentPassword\":\"Passw0rd!\"}", "{\"newPassword\":\"NewPassw0rd#\"}",
        "{\"currentPassword\":\"\",\"newPassword\":\"NewPassw0rd#\"}",
        "{\"currentPassword\":\"Passw0rd!\",\"newPassword\":12345678}",
        "{\"currentPassword\":true,\"newPassword\":\"NewPassw0rd#\"}", "{\"currentPassword\":", "",
    })
    void brokenInputIs400AndChangesNothing(String json) throws Exception {
        perform(patch(PASSWORD).header(HttpHeaders.AUTHORIZATION, bearer(a))
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"))
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
        assertUnchanged(a);
    }

    @Test
    void aSocialOnlyAccountHasNoPasswordToChange() throws Exception {
        jdbcTemplate.update("update users set password_hash = null where user_id = ?", a);

        change(a, OLD_PASSWORD, NEW_PASSWORD)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("PASSWORD_NOT_SET"))
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
        assertThat(row(a).get("password_hash")).isNull();
        assertThat(row(a).get("refresh_token_hash")).isEqualTo("keep");
    }

    @Test
    void aWrongCurrentPasswordChangesNothing() throws Exception {
        change(a, "Wrong0ne!", NEW_PASSWORD)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("CURRENT_PASSWORD_MISMATCH"))
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE))
                .andExpect(header().doesNotExist(HttpHeaders.WWW_AUTHENTICATE));
        assertUnchanged(a);
    }

    @Test
    void theSamePasswordIsRejected() throws Exception {
        change(a, OLD_PASSWORD, OLD_PASSWORD)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("PASSWORD_SAME_AS_CURRENT"))
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
        assertUnchanged(a);
    }

    @Test
    void loginIsRequired() throws Exception {
        perform(patch(PASSWORD).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"Passw0rd!\",\"newPassword\":\"NewPassw0rd#\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
    }

    @Test
    void onlyTheTokenOwnersPasswordChanges() throws Exception {
        change(a, OLD_PASSWORD, NEW_PASSWORD).andExpect(status().isNoContent());

        assertUnchanged(b);
    }

    // ---------- attempt limit (PWCHG6-1) ----------

    @Test
    void theSixthAttemptInAMinuteIs429EvenWithTheRightPassword() throws Exception {
        for (int i = 0; i < 5; i++) {
            change(a, "Wrong0ne!", NEW_PASSWORD).andExpect(status().isBadRequest());
        }
        change(a, OLD_PASSWORD, NEW_PASSWORD)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.errorCode").value("TOO_MANY_REQUESTS"))
                .andExpect(header().string(HttpHeaders.RETRY_AFTER, "60"))
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
        assertUnchanged(a);

        // Another user is not affected.
        change(b, OLD_PASSWORD, NEW_PASSWORD).andExpect(status().isNoContent());
    }

    @Test
    void brokenRequestsCountToo() throws Exception {
        for (int i = 0; i < 5; i++) {
            perform(patch(PASSWORD).header(HttpHeaders.AUTHORIZATION, bearer(a))
                            .contentType(MediaType.APPLICATION_JSON).content("{\"currentPassword\":"))
                    .andExpect(status().isBadRequest());
        }
        change(a, OLD_PASSWORD, NEW_PASSWORD).andExpect(status().isTooManyRequests());
        assertUnchanged(a);
    }

    // ---------- helpers ----------

    private void insertUser(long id, String hash) {
        jdbcTemplate.update("insert into users (user_id, email, username, password_hash, account_status,"
                + " is_agreed_term, refresh_token_hash) values (?, ?, ?, ?, 'active', true, 'keep')",
                id, "pw" + id + "@example.com", "비번" , hash);
    }

    private void assertUnchanged(long id) {
        Map<String, Object> row = row(id);
        assertThat(row.get("password_hash")).isEqualTo(oldHash);
        assertThat(row.get("refresh_token_hash")).isEqualTo("keep");
    }

    private Map<String, Object> row(long id) {
        return jdbcTemplate.queryForMap("select password_hash, refresh_token_hash, refresh_token_expires_at"
                + " from users where user_id = ?", id);
    }

    private String bearer(long id) {
        return "Bearer " + jwtTokenProvider.createAccessToken(id, UserRole.USER, NOW);
    }

    private ResultActions change(long id, String current, String next) throws Exception {
        return perform(patch(PASSWORD).header(HttpHeaders.AUTHORIZATION, bearer(id))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"currentPassword\":\"" + current + "\",\"newPassword\":\"" + next + "\"}"));
    }

    private ResultActions login(long id, String password) throws Exception {
        return perform(post(LOGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"pw" + id + "@example.com\",\"password\":\"" + password + "\"}"));
    }

    private ResultActions perform(MockHttpServletRequestBuilder request) throws Exception {
        entityManager.flush();
        entityManager.clear();
        return mockMvc.perform(request);
    }
}
