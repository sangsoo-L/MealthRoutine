package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/** Pending-deletion login with a fixed "now", so the 7-day boundary is exact (LOGIN-2, LOGIN-2a). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class LoginWithdrawalTests {

    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final Instant NOW = Instant.parse("2026-11-18T03:00:00Z");
    private static final LocalDateTime NOW_LOCAL = LocalDateTime.ofInstant(NOW, ZONE);
    private static final String EMAIL = "withdraw@example.com";
    private static final String PASSWORD = "Passw0rd!";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @MockitoBean
    private Clock clock;

    @BeforeEach
    void fixClock() {
        given(clock.instant()).willReturn(NOW);
        given(clock.getZone()).willReturn(ZONE);
    }

    @Test
    void restoredOneMinuteBeforeTheWindowEnds() throws Exception {
        long userId = insertPending(NOW_LOCAL.minusDays(7).plusMinutes(1));

        login().andExpect(status().isOk()).andExpect(jsonPath("$.data.restoredFromWithdrawal").value(true))
                .andExpect(jsonPath("$.data.user.accountStatus").value("active"));
        Map<String, Object> row = row(userId);
        assertThat(row.get("account_status")).isEqualTo("active");
        assertThat(row.get("deleted_at")).isNull();
        assertThat(row.get("refresh_token_hash")).isNotNull();
    }

    @Test
    void notRestoredExactlyAtSevenDays() throws Exception {
        assertRefusedAndUnchanged(NOW_LOCAL.minusDays(7));
    }

    @Test
    void notRestoredAfterSevenDays() throws Exception {
        assertRefusedAndUnchanged(NOW_LOCAL.minusDays(7).minusMinutes(1));
    }

    @Test
    void notRestoredWithoutWithdrawalTime() throws Exception {
        assertRefusedAndUnchanged(null);
    }

    private void assertRefusedAndUnchanged(LocalDateTime deletedAt) throws Exception {
        long userId = insertPending(deletedAt);

        login().andExpect(status().isUnauthorized()).andExpect(jsonPath("$.errorCode").value("LOGIN_FAILED"));
        Map<String, Object> row = row(userId);
        assertThat(row.get("account_status")).isEqualTo("pending_deletion");
        assertThat(row.get("refresh_token_hash")).isNull();
        if (deletedAt == null) {
            assertThat(row.get("deleted_at")).isNull();
        } else {
            assertThat((LocalDateTime) row.get("deleted_at")).isEqualTo(deletedAt);
        }
    }

    private long insertPending(LocalDateTime deletedAt) {
        jdbcTemplate.update("insert into users (email, username, password_hash, account_status, is_agreed_term, deleted_at)"
                + " values (?, '홍길동', ?, 'pending_deletion', true, ?)", EMAIL, passwordEncoder.encode(PASSWORD), deletedAt);
        return jdbcTemplate.queryForObject("select user_id from users where email = ?", Long.class, EMAIL);
    }

    private Map<String, Object> row(long userId) {
        return jdbcTemplate.queryForMap(
                "select account_status, deleted_at, refresh_token_hash from users where user_id = ?", userId);
    }

    private ResultActions login() throws Exception {
        return mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + EMAIL + "\",\"password\":\"" + PASSWORD + "\"}"));
    }
}
