package com.healthlab.mealthroutine.backend.user.dto;

/**
 * GET /api/v1/users/me (PROFILE4-1). nickname is the same value as the profile's displayName; only the field name
 * differs. role and accountStatus are the lowercase DB values ("user", "active").
 */
public record MeResponse(
        Long userId,
        String email,
        String username,
        String nickname,
        String role,
        String accountStatus,
        boolean passwordSet,
        boolean pinRegistered,
        boolean onboardingCompleted) {

    /** Hides the email and real name if this object is ever logged. JSON output does not use toString. */
    @Override
    public String toString() {
        return "MeResponse[userId=" + userId + ", email=(hidden), username=(hidden), nickname=" + nickname
                + ", role=" + role + ", accountStatus=" + accountStatus + ", passwordSet=" + passwordSet
                + ", pinRegistered=" + pinRegistered + ", onboardingCompleted=" + onboardingCompleted + "]";
    }
}
