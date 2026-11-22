package com.healthlab.mealthroutine.backend.user.dto;

import java.util.List;
import tools.jackson.databind.annotation.JsonDeserialize;

/**
 * PATCH /api/v1/users/me/profile. A missing or null field means "no change" (PROFILE4-4).
 * To clear: "" for phoneNumber and regionCode, [] for dietaryPreferences.
 * <p>
 * birthDate, gender and exerciseLevel arrive as text on purpose: Jackson turns "" into null for a LocalDate,
 * which would make "" mean "no change" instead of 400 (measured on this project's Jackson 3 setup).
 * UserProfileService checks and converts them.
 * <p>
 * Every value must be a real JSON string (or an array of strings): 12 or true is a 400, not "12" or "true"
 * ({@link StrictStringDeserializer}).
 * <p>
 * Fields not listed here (userId, role, accountStatus, profileImageUrl, ...) are ignored (PROFILE4-8).
 */
public record ProfileUpdateRequest(
        @JsonDeserialize(using = StrictStringDeserializer.class) String displayName,
        @JsonDeserialize(using = StrictStringDeserializer.class) String birthDate,
        @JsonDeserialize(using = StrictStringDeserializer.class) String gender,
        @JsonDeserialize(using = StrictStringDeserializer.class) String regionCode,
        @JsonDeserialize(using = StrictStringDeserializer.class) String exerciseLevel,
        @JsonDeserialize(using = StrictStringDeserializer.class) String phoneNumber,
        @JsonDeserialize(contentUsing = StrictStringDeserializer.class) List<String> dietaryPreferences) {

    /** Hides the birth date and phone number if this object is ever logged. */
    @Override
    public String toString() {
        return "ProfileUpdateRequest[displayName=" + displayName + ", birthDate=(hidden), gender=" + gender
                + ", regionCode=" + regionCode + ", exerciseLevel=" + exerciseLevel + ", phoneNumber=(hidden)"
                + ", dietaryPreferences=" + dietaryPreferences + "]";
    }
}
