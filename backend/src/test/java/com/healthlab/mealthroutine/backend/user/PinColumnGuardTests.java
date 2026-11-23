package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;

import com.healthlab.mealthroutine.backend.user.domain.User;
import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * PIN7-4: the PIN columns map with ddl-auto=validate, an entity flush never writes them, and the UPDATE queries do.
 * Values are read back with SQL (JDBC), not through JPA. Every test rolls back.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class PinColumnGuardTests {

    private static final long USER_ID = 9701L;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void insertUser() {
        jdbcTemplate.update("insert into users (user_id, username, password_hash, account_status, is_agreed_term,"
                + " pin_hash, pin_failed_count, pin_locked_until) values (?, 'pin', 'pw', 'active', true,"
                + " 'old-pin', 2, null)", USER_ID);
    }

    @Test
    void theEntityReadsThePinColumns() {
        User user = userRepository.findById(USER_ID).orElseThrow();
        assertThat(user.getPinHash()).isEqualTo("old-pin");
        assertThat(user.getPinFailedCount()).isEqualTo((byte) 2);
        assertThat(user.getPinLockedUntil()).isNull();
    }

    @Test
    void anEntityFlushDoesNotWriteThePinColumns() throws Exception {
        User user = userRepository.findById(USER_ID).orElseThrow();
        // No method changes these fields, so a future bug is simulated by writing them directly.
        set(user, "pinHash", "stale-pin");
        set(user, "pinFailedCount", (byte) 0);
        set(user, "pinLockedUntil", LocalDateTime.of(2030, 1, 1, 0, 0));
        set(user, "refreshTokenHash", "new-refresh"); // another column, so the flush really runs an UPDATE
        entityManager.flush();

        Map<String, Object> row = row();
        assertThat(row.get("pin_hash")).isEqualTo("old-pin");
        assertThat(((Number) row.get("pin_failed_count")).intValue()).isEqualTo(2);
        assertThat(row.get("pin_locked_until")).isNull();
        assertThat(row.get("refresh_token_hash")).isEqualTo("new-refresh");
    }

    @Test
    void theUpdateQueriesChangeThem() {
        LocalDateTime until = LocalDateTime.of(2026, 11, 23, 12, 10);
        assertThat(userRepository.savePinAttempts(USER_ID, (byte) 5, until)).isOne();
        assertThat(((Number) row().get("pin_failed_count")).intValue()).isEqualTo(5);
        assertThat(row().get("pin_locked_until")).isNotNull();

        assertThat(userRepository.savePin(USER_ID, "new-pin")).isOne();
        Map<String, Object> row = row();
        assertThat(row.get("pin_hash")).isEqualTo("new-pin");
        assertThat(((Number) row.get("pin_failed_count")).intValue()).isZero();
        assertThat(row.get("pin_locked_until")).isNull();
    }

    private static void set(User user, String fieldName, Object value) throws Exception {
        Field field = User.class.getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(user, value);
    }

    private Map<String, Object> row() {
        return jdbcTemplate.queryForMap("select pin_hash, pin_failed_count, pin_locked_until, refresh_token_hash"
                + " from users where user_id = ?", USER_ID);
    }
}
