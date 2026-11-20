package com.healthlab.mealthroutine.backend.user.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * users table. Columns are mapped only when a feature uses them; ddl-auto=validate needs every mapped
 * column to exist, so teammates' existing DBs must have run database/migration/20261118_users_token_pin_columns.sql.
 */
@Entity
@Table(name = "users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long userId;

    private String email;

    /** Real name. */
    private String username;

    private String passwordHash;

    // Left out of INSERT so the DB defaults ('active', 'user') apply.
    @Column(insertable = false)
    private AccountStatus accountStatus;

    @Column(insertable = false)
    private UserRole userRole;

    private boolean isAgreedTerm;

    /** Read only until the PIN feature; used for pinRegistered. */
    @Column(insertable = false, updatable = false)
    private String pinHash;

    /** SHA-256 of the current refresh token, never the token itself (P-01). */
    private String refreshTokenHash;

    private LocalDateTime refreshTokenExpiresAt;

    /** When withdrawal was requested; the account can be restored before this + 7 days (LOGIN-2a). */
    private LocalDateTime deletedAt;

    private static final Duration WITHDRAWAL_GRACE = Duration.ofDays(7);

    private User(String email, String username, String passwordHash, boolean isAgreedTerm) {
        this.email = email;
        this.username = username;
        this.passwordHash = passwordHash;
        this.isAgreedTerm = isAgreedTerm;
    }

    public static User createLocal(String email, String username, String passwordHash) {
        return new User(email, username, passwordHash, true);
    }

    public boolean hasPin() {
        return pinHash != null;
    }

    /** Pending deletion and still inside the window: now is strictly before deletedAt + 7 days. */
    public boolean canRestoreFromWithdrawal(LocalDateTime now) {
        return accountStatus == AccountStatus.PENDING_DELETION
                && deletedAt != null
                && now.isBefore(deletedAt.plus(WITHDRAWAL_GRACE));
    }

    public void restoreFromWithdrawal() {
        this.accountStatus = AccountStatus.ACTIVE;
        this.deletedAt = null;
    }

    /** A new login replaces the previous refresh token, which logs the other device out (one device, P-01). */
    public void replaceRefreshToken(String tokenHash, LocalDateTime expiresAt) {
        this.refreshTokenHash = tokenHash;
        this.refreshTokenExpiresAt = expiresAt;
    }
}
