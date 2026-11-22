package com.healthlab.mealthroutine.backend.user.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * GET/PATCH /api/v1/users/me/profile body (PROFILE4-1~8). gender and exerciseLevel are lowercase values.
 * profileImageUrl is response only. dietaryPreferences is never null (an empty list when nothing is saved).
 */
public record ProfileResponse(
        String displayName,
        LocalDate birthDate,
        String gender,
        String regionCode,
        String profileImageUrl,
        String exerciseLevel,
        String phoneNumber,
        List<String> dietaryPreferences) {

    /** Hides the birth date and phone number if this object is ever logged. */
    @Override
    public String toString() {
        return "ProfileResponse[displayName=" + displayName + ", birthDate=(hidden), gender=" + gender
                + ", regionCode=" + regionCode + ", profileImageUrl=" + profileImageUrl
                + ", exerciseLevel=" + exerciseLevel + ", phoneNumber=(hidden)"
                + ", dietaryPreferences=" + dietaryPreferences + "]";
    }
}
