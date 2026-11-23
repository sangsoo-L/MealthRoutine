package com.healthlab.mealthroutine.backend.user.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * user_health_preferences table, one row per user (key = user id). Only dietary_preferences (foods to avoid, Q-09)
 * is mapped. Allergies, health cautions and menstrual tracking are not collected (Q-20), so they stay unmapped and
 * get their DB defaults on INSERT.
 */
@Entity
@Table(name = "user_health_preferences")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserHealthPreference {

    @Id
    private Long userId;

    /** JSON array text such as ["오이","고수"]. The DB column is JSON, so the type code is needed for validate. */
    @JdbcTypeCode(SqlTypes.JSON)
    private String dietaryPreferences;

    /** No ON UPDATE in the DB, so the service sets it on INSERT and on every change. */
    private LocalDateTime updatedAt;

    public UserHealthPreference(Long userId, String dietaryPreferences, LocalDateTime now) {
        this.userId = userId;
        this.dietaryPreferences = dietaryPreferences;
        this.updatedAt = now;
    }

    public void changeDietaryPreferences(String dietaryPreferences, LocalDateTime now) {
        this.dietaryPreferences = dietaryPreferences;
        this.updatedAt = now;
    }
}
