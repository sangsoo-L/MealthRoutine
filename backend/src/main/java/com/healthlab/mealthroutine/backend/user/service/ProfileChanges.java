package com.healthlab.mealthroutine.backend.user.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.user.domain.ExerciseLevel;
import com.healthlab.mealthroutine.backend.user.domain.Gender;
import com.healthlab.mealthroutine.backend.user.dto.ProfileUpdateRequest;
import com.healthlab.mealthroutine.backend.user.dto.SignupRequest;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * A profile PATCH after every rule has been checked (PROFILE4-4, PROFILE4-5). Any broken rule throws 400
 * INVALID_REQUEST before anything is saved.
 * <p>
 * A null field means "no change". For regionCode and phoneNumber, "" means "clear it" and is kept as "" here;
 * {@link #storedValue} turns it into the null that is saved.
 */
record ProfileChanges(
        String displayName,
        LocalDate birthDate,
        Gender gender,
        String regionCode,
        ExerciseLevel exerciseLevel,
        String phoneNumber,
        List<String> dietaryPreferences) {

    private static final Pattern NICKNAME = Pattern.compile(SignupRequest.NICKNAME_RULE);
    private static final Pattern DATE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");
    private static final Pattern PHONE = Pattern.compile("^01[0-9]-?\\d{3,4}-?\\d{4}$");
    private static final LocalDate OLDEST_BIRTH_DATE = LocalDate.of(1900, 1, 1);
    private static final int REGION_CODE_MAX = 30;
    private static final int FOOD_MAX_LENGTH = 30;
    private static final int FOODS_MAX_COUNT = 20;

    /** today is "now" from the server clock; a birth date must be before it. */
    static ProfileChanges from(ProfileUpdateRequest request, LocalDate today) {
        return new ProfileChanges(
                displayName(request.displayName()),
                birthDate(request.birthDate(), today),
                request.gender() == null ? null : Gender.fromApiValue(request.gender()).orElseThrow(ProfileChanges::invalid),
                regionCode(request.regionCode()),
                request.exerciseLevel() == null ? null
                        : ExerciseLevel.fromApiValue(request.exerciseLevel()).orElseThrow(ProfileChanges::invalid),
                phoneNumber(request.phoneNumber()),
                dietaryPreferences(request.dietaryPreferences()));
    }

    /** Any field for the user_profiles table. "" (clear) counts as a change too (PROFILE4-3). */
    boolean touchesProfile() {
        return displayName != null || birthDate != null || gender != null || regionCode != null
                || exerciseLevel != null || phoneNumber != null;
    }

    /** dietaryPreferences is for the user_health_preferences table. [] (clear) counts as a change too. */
    boolean touchesPreferences() {
        return dietaryPreferences != null;
    }

    /** {} or all fields null (PROFILE4-7). */
    boolean isEmpty() {
        return !touchesProfile() && !touchesPreferences();
    }

    // Same rule as signup (NAME-2). Not trimmed: " 길동" is rejected like at signup.
    private static String displayName(String value) {
        if (value != null && !NICKNAME.matcher(value).matches()) {
            throw invalid();
        }
        return value;
    }

    // "" and " " fail the pattern, so they are 400, not "no change". LocalDate.parse also rejects 2001-02-30.
    private static LocalDate birthDate(String value, LocalDate today) {
        if (value == null) {
            return null;
        }
        if (!DATE.matcher(value).matches()) {
            throw invalid();
        }
        LocalDate date;
        try {
            date = LocalDate.parse(value);
        } catch (DateTimeParseException e) {
            throw invalid();
        }
        if (date.isBefore(OLDEST_BIRTH_DATE) || !date.isBefore(today)) {
            throw invalid();
        }
        return date;
    }

    // "" is checked first: it clears the value and must not hit the other rules (PROFILE4-4).
    private static String regionCode(String value) {
        if (value == null || value.isEmpty()) {
            return value;
        }
        if (value.isBlank() || value.length() > REGION_CODE_MAX) {
            throw invalid();
        }
        return value;
    }

    private static String phoneNumber(String value) {
        if (value == null || value.isEmpty()) {
            return value;
        }
        if (!PHONE.matcher(value).matches()) {
            throw invalid();
        }
        return value;
    }

    /** "" (clear) is saved as NULL. */
    static String storedValue(String value) {
        return value.isEmpty() ? null : value;
    }

    // Each item is trimmed, must then be 1-30 characters, and repeats are dropped (first one kept).
    private static List<String> dietaryPreferences(List<String> values) {
        if (values == null) {
            return null;
        }
        if (values.size() > FOODS_MAX_COUNT) {
            throw invalid();
        }
        Set<String> cleaned = new LinkedHashSet<>();
        for (String value : values) {
            if (value == null) {
                throw invalid();
            }
            String food = value.strip();
            if (food.isEmpty() || food.length() > FOOD_MAX_LENGTH) {
                throw invalid();
            }
            cleaned.add(food);
        }
        return List.copyOf(cleaned);
    }

    private static BusinessException invalid() {
        return new BusinessException(ErrorCode.INVALID_REQUEST);
    }

    /** Hides the birth date and phone number if this object is ever logged. */
    @Override
    public String toString() {
        return "ProfileChanges[displayName=" + displayName + ", birthDate=(hidden), gender=" + gender
                + ", regionCode=" + regionCode + ", exerciseLevel=" + exerciseLevel + ", phoneNumber=(hidden)"
                + ", dietaryPreferences=" + dietaryPreferences + "]";
    }
}
