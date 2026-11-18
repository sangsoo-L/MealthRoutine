package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.user.jwt.RefreshTokens;
import java.time.LocalDateTime;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
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

/**
 * No mocks and no test-level @Transactional: the restore and the refresh hash must really commit together
 * through LoginService's own transaction (LOGIN-4). The rolled-back login tests cannot show that.
 * Rows written here are deleted after each test.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class LoginCommitTests {

    private static final String EMAIL = "login-commit@example.com";
    private static final String PASSWORD = "Passw0rd!";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @AfterEach
    void cleanUp() {
        jdbcTemplate.update("delete from users where email = ?", EMAIL);
    }

    @Test
    void restoreAndRefreshHashAreCommittedTogether() throws Exception {
        jdbcTemplate.update("insert into users (email, username, password_hash, account_status, is_agreed_term, deleted_at)"
                + " values (?, '홍길동', ?, 'pending_deletion', true, ?)",
                EMAIL, passwordEncoder.encode(PASSWORD), LocalDateTime.now().minusDays(1));

        MockHttpServletResponse response = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + EMAIL + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.restoredFromWithdrawal").value(true))
                .andReturn().getResponse();

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "select account_status, deleted_at, refresh_token_hash from users where email = ?", EMAIL);
        assertThat(row.get("account_status")).isEqualTo("active");
        assertThat(row.get("deleted_at")).isNull();
        assertThat(row.get("refresh_token_hash")).isEqualTo(RefreshTokens.hash(response.getCookie("refresh_token").getValue()));
    }
}
