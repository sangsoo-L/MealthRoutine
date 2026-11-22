package com.healthlab.mealthroutine.backend.user.repository;

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
}
