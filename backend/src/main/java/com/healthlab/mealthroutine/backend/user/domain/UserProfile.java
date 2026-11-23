package com.healthlab.mealthroutine.backend.user.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * user_profiles table, one row per user. Its primary key is the user's id (@MapsId), not a new number.
 * <p>
 * exercise_level and updated_at are left out of INSERT so the DB defaults fill them (SIGNUP-IMPL-1), but they can be
 * changed later. So a new row must be saved first and changed afterwards (PROFILE4-3); setting them before the first
 * save would be silently dropped. created_at is not mapped.
 */
@Entity
@Table(name = "user_profiles")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserProfile {

    @Id
    private Long userId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    /** Nickname. */
    private String displayName;

    private LocalDate birthDate;

    private Gender gender;

    private String regionCode;

    /** Changed only by the profile-image API, never by profile PATCH. */
    @Column(insertable = false, updatable = false)
    private String profileImageUrl;

    // Same value as the DB default, so the object matches the row right after INSERT.
    @Column(insertable = false)
    private ExerciseLevel exerciseLevel = ExerciseLevel.UNDECIDED;

    private String phoneNumber;

    /** No ON UPDATE in the DB, so the service sets it on every change. */
    @Column(insertable = false)
    private LocalDateTime updatedAt;

    public UserProfile(User user, String displayName) {
        this.user = user;
        this.displayName = displayName;
    }

    /** A row with only DB defaults, for a user who has none yet. Save it before changing anything. */
    public static UserProfile empty(User user) {
        return new UserProfile(user, null);
    }

    public void changeDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public void changeBirthDate(LocalDate birthDate) {
        this.birthDate = birthDate;
    }

    public void changeGender(Gender gender) {
        this.gender = gender;
    }

    /** null clears it. */
    public void changeRegionCode(String regionCode) {
        this.regionCode = regionCode;
    }

    public void changeExerciseLevel(ExerciseLevel exerciseLevel) {
        this.exerciseLevel = exerciseLevel;
    }

    /** null clears it. */
    public void changePhoneNumber(String phoneNumber) {
        this.phoneNumber = phoneNumber;
    }

    public void markUpdated(LocalDateTime now) {
        this.updatedAt = now;
    }
}
