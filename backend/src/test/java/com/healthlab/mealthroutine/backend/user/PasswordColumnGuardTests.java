package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;

import com.healthlab.mealthroutine.backend.user.domain.User;
import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import java.lang.reflect.Field;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * LOGIN6-2: password_hash is never written by an entity flush, but the conditional UPDATE query still changes it.
 * Both are checked with SQL (JDBC), not through JPA. Every test rolls back.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class PasswordColumnGuardTests {

    private static final long USER_ID = 9601L;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void insertUser() {
        jdbcTemplate.update("insert into users (user_id, username, password_hash, account_status, is_agreed_term,"
                + " refresh_token_hash) values (?, 'guard', 'old-hash', 'active', true, 'refresh-hash')", USER_ID);
    }

    @Test
    void anEntityFlushDoesNotWriteThePasswordHash() throws Exception {
        User user = userRepository.findById(USER_ID).orElseThrow();
        // No method changes these fields, so a future bug is simulated by writing them directly.
        set(user, "passwordHash", "stale-hash");
        set(user, "refreshTokenHash", "new-refresh"); // another column, so the flush really runs an UPDATE
        entityManager.flush();

        assertThat(dbValue("password_hash")).isEqualTo("old-hash");
        assertThat(dbValue("refresh_token_hash")).isEqualTo("new-refresh");
    }

    @Test
    void theConditionalQueryChangesItOnlyWhenTheOldHashMatches() {
        assertThat(userRepository.changePassword(USER_ID, "wrong-hash", "new-hash")).isZero();
        assertThat(dbValue("password_hash")).isEqualTo("old-hash");
        assertThat(dbValue("refresh_token_hash")).isEqualTo("refresh-hash");

        assertThat(userRepository.changePassword(USER_ID, "old-hash", "new-hash")).isOne();
        assertThat(dbValue("password_hash")).isEqualTo("new-hash");
        assertThat(dbValue("refresh_token_hash")).isNull();
    }

    private static void set(User user, String fieldName, Object value) throws Exception {
        Field field = User.class.getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(user, value);
    }

    private String dbValue(String column) {
        return jdbcTemplate.queryForObject("select " + column + " from users where user_id = ?", String.class, USER_ID);
    }
}
