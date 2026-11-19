package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * No test-level @Transactional: the login transaction really rolls back when token creation fails
 * after the account was restored (LOGIN-4). Rows written here are deleted after each test.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class LoginTransactionTests {

    private static final String EMAIL = "login-tx@example.com";
    private static final String PASSWORD = "Passw0rd!";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @AfterEach
    void cleanUp() {
        jdbcTemplate.update("delete from users where email = ?", EMAIL);
    }

    @Test
    void tokenFailureKeepsWithdrawalStateAndOldRefresh() throws Exception {
        LocalDateTime deletedAt = LocalDateTime.now().minusDays(1).truncatedTo(ChronoUnit.SECONDS);
        LocalDateTime oldExpiry = LocalDateTime.now().plusDays(3).truncatedTo(ChronoUnit.SECONDS);
        jdbcTemplate.update("insert into users (email, username, password_hash, account_status, is_agreed_term, deleted_at,"
                        + " refresh_token_hash, refresh_token_expires_at) values (?, '홍길동', ?, 'pending_deletion', true, ?,"
                        + " 'old-hash', ?)",
                EMAIL, passwordEncoder.encode(PASSWORD), deletedAt, oldExpiry);
        given(jwtTokenProvider.createAccessToken(any(), any(), any())).willThrow(new IllegalStateException("token failed"));

        mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + EMAIL + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isInternalServerError());

        Map<String, Object> row = jdbcTemplate.queryForMap("select account_status, deleted_at, refresh_token_hash,"
                + " refresh_token_expires_at from users where email = ?", EMAIL);
        assertThat(row.get("account_status")).isEqualTo("pending_deletion");
        assertThat((LocalDateTime) row.get("deleted_at")).isEqualTo(deletedAt);
        assertThat(row.get("refresh_token_hash")).isEqualTo("old-hash");
        assertThat((LocalDateTime) row.get("refresh_token_expires_at")).isEqualTo(oldExpiry);
    }
}
