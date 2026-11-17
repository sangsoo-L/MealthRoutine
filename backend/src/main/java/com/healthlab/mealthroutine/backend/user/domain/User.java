package com.healthlab.mealthroutine.backend.user.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * users table. Only columns that also exist in the team SQL are mapped, so ddl-auto=validate passes
 * on every teammate's DB (token/PIN columns are added when those features are built).
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

    private User(String email, String username, String passwordHash, boolean isAgreedTerm) {
        this.email = email;
        this.username = username;
        this.passwordHash = passwordHash;
        this.isAgreedTerm = isAgreedTerm;
    }

    public static User createLocal(String email, String username, String passwordHash) {
        return new User(email, username, passwordHash, true);
    }
}
