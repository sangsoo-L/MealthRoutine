package com.healthlab.mealthroutine.backend.common.security;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.common.LoginUser;
import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.JwtProperties;
import com.healthlab.mealthroutine.backend.user.jwt.JwtSigningKey;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Access token check on real requests (decisions AUTH2-1~5). A test-only controller shows which user and role
 * the filter set, so these tests do not depend on other parts' APIs. Every test rolls back.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
@Import(JwtAuthenticationFilterTests.ProbeController.class)
class JwtAuthenticationFilterTests {

    private static final String ME = "/api/v1/test-auth/me";
    private static final String BOOM = "/api/v1/test-auth/boom";
    private static final String PUBLIC = "/api/v1/exercises";
    private static final String ERROR_CODE = "$.errorCode";
    private static final long USER_A = 9101L;
    private static final long USER_B = 9102L;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private JwtProperties jwtProperties;

    @BeforeEach
    void setUp() {
        insertUser(USER_A, "active");
        insertUser(USER_B, "active");
    }

    @Test
    void noTokenOnProtectedUrlAsksForLogin() throws Exception {
        mockMvc.perform(get(ME))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, "Bearer"))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath(ERROR_CODE).value("LOGIN_REQUIRED"));
    }

    @Test
    void xUserIdHeaderIsIgnored() throws Exception {
        mockMvc.perform(get(ME).header("X-User-Id", String.valueOf(USER_A)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath(ERROR_CODE).value("LOGIN_REQUIRED"));
    }

    @Test
    void validTokenGivesTheUserAndRoleWithoutASession() throws Exception {
        perform(get(ME), USER_A)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(USER_A))
                .andExpect(jsonPath("$.authorities[0]").value("ROLE_USER"))
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
    }

    @Test
    void tokenWinsOverXUserId() throws Exception {
        perform(get(ME).header("X-User-Id", String.valueOf(USER_B)), USER_A)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(USER_A));
    }

    @Test
    void schemeNameIsCaseInsensitive() throws Exception {
        mockMvc.perform(get(ME).header(HttpHeaders.AUTHORIZATION, "bearer " + tokenFor(USER_A)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(USER_A));
    }

    @Test
    void expiredTokenSaysExpired() throws Exception {
        String expired = jwtTokenProvider.createAccessToken(USER_A, UserRole.USER,
                Instant.now().minus(Duration.ofMinutes(31)));

        mockMvc.perform(get(ME).header(HttpHeaders.AUTHORIZATION, "Bearer " + expired))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, containsString("invalid_token")))
                .andExpect(jsonPath(ERROR_CODE).value("TOKEN_EXPIRED"));
    }

    @Test
    void badTokensAreInvalid() throws Exception {
        String valid = tokenFor(USER_A);
        String otherKey = Jwts.builder().subject(String.valueOf(USER_A)).claim("token_type", "access")
                .expiration(Date.from(Instant.now().plusSeconds(600)))
                .signWith(Keys.hmacShaKeyFor(randomBytes(32)), Jwts.SIG.HS256).compact();
        String noType = Jwts.builder().subject(String.valueOf(USER_A))
                .expiration(Date.from(Instant.now().plusSeconds(600)))
                .signWith(JwtSigningKey.fromBase64(jwtProperties.secret()), Jwts.SIG.HS256).compact();

        for (String authorization : List.of("Bearer not-a-jwt", "Bearer ", "Bearer", valid, "Basic " + valid,
                "Bearer " + otherKey, "Bearer " + noType)) {
            mockMvc.perform(get(ME).header(HttpHeaders.AUTHORIZATION, authorization))
                    .andExpect(status().isUnauthorized())
                    .andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, containsString("invalid_token")))
                    .andExpect(jsonPath(ERROR_CODE).value("INVALID_TOKEN"));
        }
    }

    @Test
    void validTokenOfMissingUserAsksForLogin() throws Exception {
        perform(get(ME), 999_999_999L)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath(ERROR_CODE).value("LOGIN_REQUIRED"));
    }

    @Test
    void sameTokenIsRejectedAfterTheAccountStatusChanges() throws Exception {
        String token = tokenFor(USER_A); // one token string reused for every request below
        mockMvc.perform(get(ME).header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk());

        setStatus(USER_A, "suspended");
        mockMvc.perform(get(ME).header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist(HttpHeaders.WWW_AUTHENTICATE))
                .andExpect(jsonPath(ERROR_CODE).value("ACCOUNT_SUSPENDED"));

        for (String status : List.of("pending_deletion", "deleted")) {
            setStatus(USER_A, status);
            mockMvc.perform(get(ME).header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath(ERROR_CODE).value("LOGIN_REQUIRED"));
        }

        setStatus(USER_A, "active");
        mockMvc.perform(get(ME).header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void sameTokenSeesARoleChangeInTheDb() throws Exception {
        String token = tokenFor(USER_A); // the token itself says role=user
        mockMvc.perform(get(ME).header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(jsonPath("$.authorities[0]").value("ROLE_USER"));

        jdbcTemplate.update("update users set user_role = 'super_admin' where user_id = ?", USER_A);

        mockMvc.perform(get(ME).header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authorities[0]").value("ROLE_SUPER_ADMIN"));
    }

    @Test
    void publicUrlAllowsGuestsButRejectsBadTokens() throws Exception {
        mockMvc.perform(get(PUBLIC)).andExpect(status().isOk());
        perform(get(PUBLIC), USER_A).andExpect(status().isOk());

        mockMvc.perform(get(PUBLIC).header(HttpHeaders.AUTHORIZATION, "Bearer not-a-jwt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath(ERROR_CODE).value("INVALID_TOKEN"));
        String expired = jwtTokenProvider.createAccessToken(USER_A, UserRole.USER,
                Instant.now().minus(Duration.ofMinutes(31)));
        mockMvc.perform(get(PUBLIC).header(HttpHeaders.AUTHORIZATION, "Bearer " + expired))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath(ERROR_CODE).value("TOKEN_EXPIRED"));
    }

    /**
     * This 401 is not made by the filter: the routine URL is public, so a guest passes the filter and
     * RoutineService throws LOGIN_REQUIRED, which GlobalExceptionHandler turns into the response.
     */
    @Test
    void guestReadingAPrivateRoutineGetsTheSameHeaderFromTheExceptionHandler() throws Exception {
        jdbcTemplate.update("insert into exercise_routines (owner_user_id, routine_name, visibility)"
                + " values (?, 'filter-test routine', 'private')", USER_A);
        Long routineId = jdbcTemplate.queryForObject("select last_insert_id()", Long.class);
        String url = "/api/v1/workout-routines/" + routineId;

        mockMvc.perform(get(url))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, "Bearer"))
                .andExpect(jsonPath(ERROR_CODE).value("LOGIN_REQUIRED"));
        // The same URL with a member's token reaches the service too (403, not a filter 401).
        perform(get(url), USER_B)
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist(HttpHeaders.WWW_AUTHENTICATE))
                .andExpect(jsonPath(ERROR_CODE).value("ACCESS_DENIED"));
    }

    @Test
    void controllerErrorStaysAServerError() throws Exception {
        perform(get(BOOM), USER_A)
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath(ERROR_CODE).value("INTERNAL_ERROR"));
    }

    private ResultActions perform(MockHttpServletRequestBuilder request, long userId) throws Exception {
        return mockMvc.perform(request.header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(userId)));
    }

    private String tokenFor(long userId) {
        return jwtTokenProvider.createAccessToken(userId, UserRole.USER, Instant.now());
    }

    private void insertUser(long userId, String status) {
        jdbcTemplate.update("insert into users (user_id, username, account_status, is_agreed_term)"
                + " values (?, 'filter-test', ?, true)", userId, status);
    }

    private void setStatus(long userId, String status) {
        jdbcTemplate.update("update users set account_status = ? where user_id = ?", status, userId);
    }

    private static byte[] randomBytes(int length) {
        byte[] bytes = new byte[length];
        new SecureRandom().nextBytes(bytes);
        return bytes;
    }

    /** Test-only endpoints. Not listed as public in SecurityConfig, so they need login. */
    @RestController
    static class ProbeController {

        @GetMapping(ME)
        Map<String, Object> me(@LoginUser Long userId) {
            List<String> authorities = SecurityContextHolder.getContext().getAuthentication().getAuthorities()
                    .stream().map(GrantedAuthority::getAuthority).toList();
            return Map.of("userId", userId, "authorities", authorities);
        }

        @GetMapping(BOOM)
        void boom(@LoginUser Long userId) {
            throw new IllegalStateException("test-only failure");
        }
    }
}
