package com.healthlab.mealthroutine.backend.user.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * user_profiles table, one row per user. Its primary key is the user's id (@MapsId), not a new number.
 * exercise_level and timestamps are not mapped, so the DB defaults fill them.
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

    public UserProfile(User user, String displayName) {
        this.user = user;
        this.displayName = displayName;
    }
}
