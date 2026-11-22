package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.dto.RefreshResponse;
import com.healthlab.mealthroutine.backend.user.jwt.JwtProperties;
import com.healthlab.mealthroutine.backend.user.jwt.JwtSigningKey;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.healthlab.mealthroutine.backend.user.jwt.RefreshTokens;
import com.healthlab.mealthroutine.backend.user.service.RefreshResult;
import com.jayway.jsonpath.JsonPath;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * POST /api/v1/auth/token/refresh and /logout (login unit 3, AUTH3-1~5, D-2, D-3, D-7) with a fixed "now".
 * Every test rolls back. The test transaction spans all requests, so {@link #perform} clears the JPA cache first:
 * otherwise a request would see the user as an earlier request loaded it, not as the test changed it with SQL.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class TokenRefreshApiTests {

    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final Instant NOW = Instant.parse("2026-11-23T03:00:00Z");
    private static final LocalDateTime NOW_LOCAL = LocalDateTime.ofInstant(NOW, ZONE);
    private static final String REFRESH = "/api/v1/auth/token/refresh";
    private static final String LOGOUT = "/api/v1/auth/logout";
    private static final String PROTECTED = "/api/v1/users/me/favorite-exercises";
    private static final String COOKIE = "refresh_token";
    private static final String CSRF = "X-Requested-With";
    private static final String CSRF_VALUE = "XMLHttpRequest";
    private static final String ERROR_CODE = "$.errorCode";
    private static final long USER_ID = 9201L;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private JwtProperties jwtProperties;

    @Autowired
    private EntityManager entityManager;

    @MockitoBean
    private Clock clock;

    private String token;

    @BeforeEach
    void setUp() {
        given(clock.instant()).willReturn(NOW);
        given(clock.getZone()).willReturn(ZONE);
        token = RefreshTokens.generate();
        jdbcTemplate.update("insert into users (user_id, username, account_status, is_agreed_term,"
                + " refresh_token_hash, refresh_token_expires_at) values (?, 'refresh-test', 'active', true, ?, ?)",
                USER_ID, RefreshTokens.hash(token), NOW_LOCAL.plusDays(3));
    }

    // ---------- refresh ----------

    @Test
    void refreshGivesAWorkingAccessTokenAndRotatesTheCookie() throws Exception {
        MockHttpServletResponse response = refresh(token)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(cookie().httpOnly(COOKIE, true))
                .andExpect(cookie().secure(COOKIE, true))
                .andExpect(cookie().path(COOKIE, "/api/v1/auth"))
                .andExpect(cookie().maxAge(COOKIE, (int) Duration.ofDays(14).toSeconds()))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, org.hamcrest.Matchers.containsString("SameSite=Lax")))
                .andReturn().getResponse();

        String newToken = response.getCookie(COOKIE).getValue();
        assertThat(newToken).isNotBlank().isNotEqualTo(token);
        String body = response.getContentAsString();
        assertThat(body).doesNotContain(newToken).doesNotContain(token).doesNotContain("refresh");

        String accessToken = JsonPath.read(body, "$.data.accessToken");
        Claims claims = Jwts.parser().verifyWith(JwtSigningKey.fromBase64(jwtProperties.secret()))
                .clock(() -> java.util.Date.from(NOW)).build().parseSignedClaims(accessToken).getPayload();
        assertThat(claims.getSubject()).isEqualTo(String.valueOf(USER_ID));
        assertThat(claims.get("token_type", String.class)).isEqualTo("access");
        perform(get(PROTECTED).header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status().isOk());

        Map<String, Object> row = row();
        assertThat(row.get("refresh_token_hash")).isEqualTo(RefreshTokens.hash(newToken));
        assertThat((LocalDateTime) row.get("refresh_token_expires_at")).isEqualTo(NOW_LOCAL.plusDays(14));
    }

    @Test
    void theAccessTokenCarriesTheCurrentRoleFromTheDb() throws Exception {
        jdbcTemplate.update("update users set user_role = 'super_admin' where user_id = ?", USER_ID);

        String body = refresh(token).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        Claims claims = Jwts.parser().verifyWith(JwtSigningKey.fromBase64(jwtProperties.secret()))
                .clock(() -> java.util.Date.from(NOW)).build()
                .parseSignedClaims(JsonPath.<String>read(body, "$.data.accessToken")).getPayload();
        assertThat(claims.get("role", String.class)).isEqualTo("super_admin");
    }

    @Test
    void theOldCookieStopsWorkingAfterRotation() throws Exception {
        String newToken = refresh(token).andExpect(status().isOk())
                .andReturn().getResponse().getCookie(COOKIE).getValue();

        expectRefreshInvalidAndNothingChanged(refreshRequest(token), RefreshTokens.hash(newToken));
        refresh(newToken).andExpect(status().isOk());
    }

    @Test
    void badCookiesAreRefusedWithoutTouchingTheCookieOrTheDb() throws Exception {
        String stored = RefreshTokens.hash(token);
        expectRefreshInvalidAndNothingChanged(post(REFRESH).header(CSRF, CSRF_VALUE), stored); // no cookie
        expectRefreshInvalidAndNothingChanged(refreshRequest(""), stored);
        expectRefreshInvalidAndNothingChanged(refreshRequest(RefreshTokens.generate()), stored);
    }

    @Test
    void expiresExactlyAtTheExpiryTime() throws Exception {
        setExpiry(NOW_LOCAL.plusSeconds(1));
        refresh(token).andExpect(status().isOk());

        for (LocalDateTime expiry : List.of(NOW_LOCAL, NOW_LOCAL.minusSeconds(1))) {
            token = RefreshTokens.generate();
            jdbcTemplate.update("update users set refresh_token_hash = ?, refresh_token_expires_at = ? where user_id = ?",
                    RefreshTokens.hash(token), expiry, USER_ID);
            expectRefreshInvalidAndNothingChanged(refreshRequest(token), RefreshTokens.hash(token));
        }
    }

    @Test
    void accountsThatCannotLogInAreRefused() throws Exception {
        for (String accountStatus : List.of("pending_deletion", "deleted")) {
            setStatus(accountStatus);
            expectRefreshInvalidAndNothingChanged(refreshRequest(token), RefreshTokens.hash(token));
        }

        setStatus("suspended");
        refresh(token)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath(ERROR_CODE).value("ACCOUNT_SUSPENDED"))
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
        assertThat(row().get("refresh_token_hash")).isEqualTo(RefreshTokens.hash(token));
    }

    // ---------- CSRF header (AUTH3-5) ----------

    @Test
    void refreshAndLogoutNeedTheCsrfHeader() throws Exception {
        for (String path : List.of(REFRESH, LOGOUT)) {
            for (MockHttpServletRequestBuilder request : List.of(
                    post(path).cookie(new Cookie(COOKIE, token)),
                    post(path).cookie(new Cookie(COOKIE, token)).header(CSRF, "fetch"))) {
                perform(request)
                        .andExpect(status().isForbidden())
                        .andExpect(jsonPath(ERROR_CODE).value("CSRF_REJECTED"))
                        .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE))
                        .andExpect(header().doesNotExist(HttpHeaders.WWW_AUTHENTICATE));
            }
        }
        Map<String, Object> row = row();
        assertThat(row.get("refresh_token_hash")).isEqualTo(RefreshTokens.hash(token));
        assertThat((LocalDateTime) row.get("refresh_token_expires_at")).isEqualTo(NOW_LOCAL.plusDays(3));
    }

    // ---------- Authorization header on the cookie endpoints (D-2) ----------

    @Test
    void refreshAndLogoutIgnoreABadOrExpiredAccessToken() throws Exception {
        String expired = jwtTokenProvider.createAccessToken(USER_ID, UserRole.USER, NOW.minus(Duration.ofMinutes(31)));

        String newToken = refresh(token, "Bearer " + expired).andExpect(status().isOk())
                .andReturn().getResponse().getCookie(COOKIE).getValue();
        refresh(newToken, "Bearer not-a-jwt").andExpect(status().isOk());

        perform(post(LOGOUT).header(CSRF, CSRF_VALUE).header(HttpHeaders.AUTHORIZATION, "Bearer " + expired))
                .andExpect(status().isNoContent());
    }

    @Test
    void theExceptionCoversOnlyTheTwoExactPostPaths() throws Exception {
        List<MockHttpServletRequestBuilder> others = List.of(
                post(REFRESH + "/x"), post(REFRESH + "x"), post(LOGOUT + "/x"), post(LOGOUT + "x"),
                get(REFRESH), get(LOGOUT), get("/api/v1/exercises"));
        for (MockHttpServletRequestBuilder request : others) {
            perform(request.header(CSRF, CSRF_VALUE).cookie(new Cookie(COOKIE, token))
                            .header(HttpHeaders.AUTHORIZATION, "Bearer not-a-jwt"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath(ERROR_CODE).value("INVALID_TOKEN"));
        }
        assertThat(row().get("refresh_token_hash")).isEqualTo(RefreshTokens.hash(token));
    }

    // ---------- logout (D-3) ----------

    @Test
    void logoutClearsTheTokenAndDeletesTheCookie() throws Exception {
        logout(token)
                .andExpect(status().isNoContent())
                .andExpect(cookie().maxAge(COOKIE, 0))
                .andExpect(cookie().value(COOKIE, ""))
                .andExpect(cookie().path(COOKIE, "/api/v1/auth"))
                .andExpect(cookie().httpOnly(COOKIE, true))
                .andExpect(cookie().secure(COOKIE, true));

        Map<String, Object> row = row();
        assertThat(row.get("refresh_token_hash")).isNull();
        assertThat(row.get("refresh_token_expires_at")).isNull();
        expectRefreshInvalidAndNothingChanged(refreshRequest(token), null);
    }

    @Test
    void logoutWithoutAMatchingCookieIsStillNoContent() throws Exception {
        perform(post(LOGOUT).header(CSRF, CSRF_VALUE))
                .andExpect(status().isNoContent())
                .andExpect(cookie().maxAge(COOKIE, 0));
        logout("").andExpect(status().isNoContent());
        logout(RefreshTokens.generate()).andExpect(status().isNoContent());
        assertThat(row().get("refresh_token_hash")).isEqualTo(RefreshTokens.hash(token));

        logout(token).andExpect(status().isNoContent());
        logout(token).andExpect(status().isNoContent()); // twice in a row
        assertThat(row().get("refresh_token_hash")).isNull();
    }

    /**
     * Sequential: the newer login has already finished when the old cookie arrives. This checks the hash condition
     * in the UPDATE; it does not race a login between lookup and update (the server has no such gap, see D-3).
     */
    @Test
    void logoutWithAnOldCookieKeepsTheNewerLogin() throws Exception {
        String newer = RefreshTokens.generate();
        jdbcTemplate.update("update users set refresh_token_hash = ? where user_id = ?", RefreshTokens.hash(newer), USER_ID);
        logout(token).andExpect(status().isNoContent());
        assertThat(row().get("refresh_token_hash")).isEqualTo(RefreshTokens.hash(newer));

        String rotated = refresh(newer).andExpect(status().isOk())
                .andReturn().getResponse().getCookie(COOKIE).getValue();
        logout(newer).andExpect(status().isNoContent());
        assertThat(row().get("refresh_token_hash")).isEqualTo(RefreshTokens.hash(rotated));
    }

    @Test
    void anAccessTokenStaysValidAfterLogout() throws Exception {
        String accessToken = jwtTokenProvider.createAccessToken(USER_ID, UserRole.USER, NOW);
        logout(token).andExpect(status().isNoContent());

        // Allowed for up to 30 minutes (AUTH2-2).
        perform(get(PROTECTED).header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status().isOk());
    }

    @Test
    void tokensAreHiddenInToString() {
        assertThat(new RefreshResult("access-value", "refresh-value").toString())
                .doesNotContain("access-value").doesNotContain("refresh-value");
        assertThat(new RefreshResponse("access-value").toString()).doesNotContain("access-value");
    }

    // ---------- helpers ----------

    /**
     * Takes the request, not its result, so the stored values are read BEFORE the request runs. Reading them after
     * would compare the row with itself and miss a failed refresh that changed the expiry.
     */
    private void expectRefreshInvalidAndNothingChanged(MockHttpServletRequestBuilder request, String expectedHash)
            throws Exception {
        Map<String, Object> before = row();
        assertThat(before.get("refresh_token_hash")).isEqualTo(expectedHash);
        LocalDateTime expiryBefore = (LocalDateTime) before.get("refresh_token_expires_at");

        perform(request).andExpect(status().isUnauthorized())
                .andExpect(jsonPath(ERROR_CODE).value("REFRESH_INVALID"))
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE))
                .andExpect(header().doesNotExist(HttpHeaders.WWW_AUTHENTICATE));
        Map<String, Object> row = row();
        assertThat(row.get("refresh_token_hash")).isEqualTo(expectedHash);
        assertThat((LocalDateTime) row.get("refresh_token_expires_at")).isEqualTo(expiryBefore);
    }

    private ResultActions refresh(String cookieValue) throws Exception {
        return perform(refreshRequest(cookieValue));
    }

    private static MockHttpServletRequestBuilder refreshRequest(String cookieValue) {
        return post(REFRESH).header(CSRF, CSRF_VALUE).cookie(new Cookie(COOKIE, cookieValue));
    }

    private ResultActions refresh(String cookieValue, String authorization) throws Exception {
        return perform(post(REFRESH).header(CSRF, CSRF_VALUE).cookie(new Cookie(COOKIE, cookieValue))
                .header(HttpHeaders.AUTHORIZATION, authorization));
    }

    private ResultActions logout(String cookieValue) throws Exception {
        return perform(post(LOGOUT).header(CSRF, CSRF_VALUE).cookie(new Cookie(COOKIE, cookieValue)));
    }

    private ResultActions perform(MockHttpServletRequestBuilder request) throws Exception {
        entityManager.flush();
        entityManager.clear();
        return mockMvc.perform(request);
    }

    private Map<String, Object> row() {
        return jdbcTemplate.queryForMap(
                "select refresh_token_hash, refresh_token_expires_at from users where user_id = ?", USER_ID);
    }

    private void setExpiry(LocalDateTime expiry) {
        jdbcTemplate.update("update users set refresh_token_expires_at = ? where user_id = ?", expiry, USER_ID);
    }

    private void setStatus(String accountStatus) {
        jdbcTemplate.update("update users set account_status = ? where user_id = ?", accountStatus, USER_ID);
    }
}
