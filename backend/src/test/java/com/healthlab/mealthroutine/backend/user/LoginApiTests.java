package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.user.jwt.JwtProperties;
import com.healthlab.mealthroutine.backend.user.jwt.JwtSigningKey;
import com.healthlab.mealthroutine.backend.user.jwt.RefreshTokens;
import com.jayway.jsonpath.JsonPath;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/** POST /api/v1/auth/login against mealthroutine_test. Every test rolls back. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class LoginApiTests {

    private static final String LOGIN = "/api/v1/auth/login";
    private static final String EMAIL = "login@example.com";
    private static final String PASSWORD = "Passw0rd!";
    private static final String ERROR_CODE = "$.errorCode";
    private static final String COOKIE = "refresh_token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtProperties jwtProperties;

    @Test
    void loginIssuesAccessTokenAndRefreshCookie() throws Exception {
        long userId = insertUser(EMAIL, PASSWORD, "active");

        MockHttpServletResponse response = login(EMAIL, PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.userId").value(userId))
                .andExpect(jsonPath("$.data.user.role").value("user"))
                .andExpect(jsonPath("$.data.user.accountStatus").value("active"))
                .andExpect(jsonPath("$.data.user.pinRegistered").value(false))
                .andExpect(jsonPath("$.data.user.onboardingCompleted").value(false))
                .andExpect(jsonPath("$.data.restoredFromWithdrawal").value(false))
                .andExpect(cookie().httpOnly(COOKIE, true))
                .andExpect(cookie().secure(COOKIE, true))
                .andExpect(cookie().path(COOKIE, "/api/v1/auth"))
                .andExpect(cookie().maxAge(COOKIE, (int) Duration.ofDays(14).toSeconds()))
                .andExpect(header().string("Set-Cookie", containsString("SameSite=Lax")))
                .andReturn().getResponse();

        String body = response.getContentAsString();
        String refreshToken = response.getCookie(COOKIE).getValue();
        assertThat(body).doesNotContain(PASSWORD).doesNotContain("password").doesNotContain(refreshToken)
                .doesNotContain("refresh");

        Claims claims = Jwts.parser().verifyWith(JwtSigningKey.fromBase64(jwtProperties.secret())).build()
                .parseSignedClaims(JsonPath.read(body, "$.data.accessToken")).getPayload();
        assertThat(claims.getSubject()).isEqualTo(String.valueOf(userId));
        assertThat(claims.get("role", String.class)).isEqualTo("user");
        assertThat(Duration.between(claims.getIssuedAt().toInstant(), claims.getExpiration().toInstant()))
                .isEqualTo(Duration.ofMinutes(30));
        assertThat(claims.keySet()).containsExactlyInAnyOrder("sub", "role", "iat", "exp");

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "select refresh_token_hash, refresh_token_expires_at from users where user_id = ?", userId);
        assertThat(row.get("refresh_token_hash")).isEqualTo(RefreshTokens.hash(refreshToken)).isNotEqualTo(refreshToken);
        LocalDateTime expiresAt = (LocalDateTime) row.get("refresh_token_expires_at");
        assertThat(Duration.between(LocalDateTime.now(), expiresAt)).isBetween(Duration.ofDays(14).minusMinutes(1),
                Duration.ofDays(14).plusMinutes(1));
    }

    @Test
    void secondLoginReplacesStoredRefreshHash() throws Exception {
        long userId = insertUser(EMAIL, PASSWORD, "active");
        String first = login(EMAIL, PASSWORD).andReturn().getResponse().getCookie(COOKIE).getValue();
        String second = login(EMAIL, PASSWORD).andReturn().getResponse().getCookie(COOKIE).getValue();

        assertThat(second).isNotEqualTo(first);
        assertThat(storedHash(userId)).isEqualTo(RefreshTokens.hash(second));
    }

    @Test
    void unknownEmailWrongPasswordAndSocialOnlyGiveTheSameAnswer() throws Exception {
        long userId = insertUser(EMAIL, PASSWORD, "active");
        jdbcTemplate.update("insert into users (email, username, is_agreed_term) values ('social@example.com', '홍길동', true)");

        String unknown = failedBody(login("nobody@example.com", PASSWORD));
        String wrongPassword = failedBody(login(EMAIL, "Wrong0rd!"));
        String socialOnly = failedBody(login("social@example.com", PASSWORD));

        assertThat(wrongPassword).isEqualTo(unknown);
        assertThat(socialOnly).isEqualTo(unknown);
        assertThat(unknown).contains("LOGIN_FAILED").contains("이메일 또는 비밀번호를 확인해 주세요.");
        assertThat(storedHash(userId)).isNull();
    }

    @Test
    void emailIsTrimmedAndLowercased() throws Exception {
        insertUser(EMAIL, PASSWORD, "active");

        login("  Login@Example.COM ", PASSWORD).andExpect(status().isOk());
    }

    @Test
    void suspendedAccountIsToldOnlyWithTheRightPassword() throws Exception {
        long userId = insertUser(EMAIL, PASSWORD, "suspended");

        login(EMAIL, PASSWORD)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath(ERROR_CODE).value("ACCOUNT_SUSPENDED"))
                .andExpect(jsonPath("$.message").value("정지된 계정입니다. 고객센터에 문의해 주세요."))
                .andExpect(header().doesNotExist("Set-Cookie"));
        login(EMAIL, "Wrong0rd!").andExpect(status().isUnauthorized()).andExpect(jsonPath(ERROR_CODE).value("LOGIN_FAILED"));
        assertThat(storedHash(userId)).isNull();
    }

    @Test
    void deletedAccountWithEmailAndHashLeftIsRefused() throws Exception {
        long userId = insertUser(EMAIL, PASSWORD, "deleted");

        login(EMAIL, PASSWORD)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath(ERROR_CODE).value("LOGIN_FAILED"))
                .andExpect(header().doesNotExist("Set-Cookie"));
        assertThat(storedHash(userId)).isNull();
    }

    @Test
    void pinRegisteredFollowsPinHash() throws Exception {
        long userId = insertUser(EMAIL, PASSWORD, "active");
        jdbcTemplate.update("update users set pin_hash = 'x' where user_id = ?", userId);

        login(EMAIL, PASSWORD).andExpect(jsonPath("$.data.user.pinRegistered").value(true));
    }

    @Test
    void blankFieldsAreRejected() throws Exception {
        login("", PASSWORD).andExpect(status().isBadRequest()).andExpect(jsonPath(ERROR_CODE).value("INVALID_REQUEST"));
        login(EMAIL, "").andExpect(status().isBadRequest());
        mockMvc.perform(post(LOGIN).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
    }

    private long insertUser(String email, String password, String status) {
        jdbcTemplate.update("insert into users (email, username, password_hash, account_status, is_agreed_term)"
                + " values (?, '홍길동', ?, ?, true)", email, passwordEncoder.encode(password), status);
        return jdbcTemplate.queryForObject("select user_id from users where email = ?", Long.class, email);
    }

    private String storedHash(long userId) {
        return jdbcTemplate.queryForObject("select refresh_token_hash from users where user_id = ?", String.class, userId);
    }

    private static String failedBody(ResultActions actions) throws Exception {
        return actions.andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("Set-Cookie"))
                .andReturn().getResponse().getContentAsString();
    }

    private ResultActions login(String email, String password) throws Exception {
        return mockMvc.perform(post(LOGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"));
    }
}
