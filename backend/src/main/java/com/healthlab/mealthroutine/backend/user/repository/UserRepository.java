package com.healthlab.mealthroutine.backend.user.repository;

import com.healthlab.mealthroutine.backend.user.domain.AccountStatus;
import com.healthlab.mealthroutine.backend.user.domain.User;
import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, Long> {

    boolean existsByEmail(String email);

    Optional<User> findByEmail(String email);

    /** No index on refresh_token_hash: fine for the MVP user count (AUTH3-1). */
    Optional<User> findByRefreshTokenHash(String refreshTokenHash);

    /**
     * Rotation as one conditional UPDATE (AUTH3-3): it changes the row only if the old hash is still there.
     * When two requests use the same cookie at once, the second one updates 0 rows.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update User u set u.refreshTokenHash = :newHash, u.refreshTokenExpiresAt = :expiresAt"
            + " where u.userId = :userId and u.refreshTokenHash = :oldHash")
    int rotateRefreshToken(@Param("userId") Long userId, @Param("oldHash") String oldHash,
            @Param("newHash") String newHash, @Param("expiresAt") LocalDateTime expiresAt);

    /**
     * Logout as one conditional UPDATE (D-3): clears only the row that still has this hash, so a logout with an old
     * cookie never ends a newer login or refresh.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update User u set u.refreshTokenHash = null, u.refreshTokenExpiresAt = null"
            + " where u.refreshTokenHash = :hash")
    int clearRefreshToken(@Param("hash") String hash);

    /**
     * Saves a login (LOGIN6-1) only if the password hash is still the one the login just verified. Without the
     * condition, a password change that commits between the check and this save would be undone in effect: the old
     * password's login would get a working refresh token again. 0 rows = the password changed meanwhile.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update User u set u.refreshTokenHash = :refreshHash, u.refreshTokenExpiresAt = :expiresAt"
            + " where u.userId = :userId and u.passwordHash = :verifiedHash")
    int saveLogin(@Param("userId") Long userId, @Param("verifiedHash") String verifiedHash,
            @Param("refreshHash") String refreshHash, @Param("expiresAt") LocalDateTime expiresAt);

    /**
     * Same as {@link #saveLogin} for a pending-deletion account that this login restores (LOGIN-2a): the account
     * also becomes active again. Requires the account to still be pending deletion.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update User u set u.refreshTokenHash = :refreshHash, u.refreshTokenExpiresAt = :expiresAt,"
            + " u.accountStatus = :active, u.deletedAt = null"
            + " where u.userId = :userId and u.passwordHash = :verifiedHash and u.accountStatus = :pending")
    int saveLoginRestoringAccount(@Param("userId") Long userId, @Param("verifiedHash") String verifiedHash,
            @Param("refreshHash") String refreshHash, @Param("expiresAt") LocalDateTime expiresAt,
            @Param("active") AccountStatus active, @Param("pending") AccountStatus pending);

    /**
     * Password change (PWCHG6-2) as one conditional UPDATE: only if the hash is still the one that was verified, so
     * two changes at once cannot both win. It also ends every refresh login (P-01).
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update User u set u.passwordHash = :newHash, u.refreshTokenHash = null, u.refreshTokenExpiresAt = null"
            + " where u.userId = :userId and u.passwordHash = :oldHash")
    int changePassword(@Param("userId") Long userId, @Param("oldHash") String oldHash,
            @Param("newHash") String newHash);
}
