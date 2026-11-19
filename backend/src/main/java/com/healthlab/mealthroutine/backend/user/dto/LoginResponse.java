package com.healthlab.mealthroutine.backend.user.dto;

/** Login body (excerpt 7.3). The refresh token is never in the body; it goes in an HttpOnly cookie. */
public record LoginResponse(String accessToken, UserSummary user, boolean restoredFromWithdrawal) {

    /** Hides the access token if this object is ever logged. JSON output does not use toString. */
    @Override
    public String toString() {
        return "LoginResponse[accessToken=(hidden), user=" + user
                + ", restoredFromWithdrawal=" + restoredFromWithdrawal + "]";
    }

    /** role and accountStatus use the lowercase DB values ("user", "active"). */
    public record UserSummary(Long userId, String role, String accountStatus, boolean pinRegistered,
                              boolean onboardingCompleted) {
    }
}
