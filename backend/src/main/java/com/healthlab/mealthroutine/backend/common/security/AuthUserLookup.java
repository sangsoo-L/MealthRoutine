package com.healthlab.mealthroutine.backend.common.security;

import java.util.List;
import java.util.Locale;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Reads the account status and role on every authenticated request (decision AUTH2-2), so a suspension,
 * withdrawal or role change applies at once instead of after the token expires.
 * Kept apart from the filter so tests can replace it to simulate a DB failure.
 */
@Component
@RequiredArgsConstructor
public class AuthUserLookup {

    private static final String SQL = "select account_status, user_role from users where user_id = ?";

    private final JdbcTemplate jdbcTemplate;

    /** Empty when there is no such user. DB errors are not caught here. */
    public Optional<AuthUser> find(long userId) {
        List<AuthUser> rows = jdbcTemplate.query(SQL,
                (rs, rowNum) -> new AuthUser(userId, rs.getString("account_status"), rs.getString("user_role")),
                userId);
        return rows.stream().findFirst();
    }

    /** accountStatus and role are the lowercase DB values ("active", "user"). */
    public record AuthUser(long userId, String accountStatus, String role) {

        public String authority() {
            return "ROLE_" + role.toUpperCase(Locale.ROOT);
        }
    }
}
