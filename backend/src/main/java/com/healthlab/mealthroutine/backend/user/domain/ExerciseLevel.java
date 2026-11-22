package com.healthlab.mealthroutine.backend.user.domain;

import com.healthlab.mealthroutine.backend.common.LowerCaseEnumConverter;
import jakarta.persistence.Converter;
import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;

/** Exercise level in user_profiles.exercise_level (DB default undecided). API and DB both use the lowercase value. */
public enum ExerciseLevel {
    BEGINNER,
    INTERMEDIATE,
    ADVANCED,
    UNDECIDED;

    public String apiValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    /** Exact lowercase match only: an upper-case or empty value does not match. */
    public static Optional<ExerciseLevel> fromApiValue(String value) {
        return Arrays.stream(values()).filter(v -> v.apiValue().equals(value)).findFirst();
    }

    @Converter(autoApply = true)
    public static class DbConverter extends LowerCaseEnumConverter<ExerciseLevel> {
        public DbConverter() {
            super(ExerciseLevel.class);
        }
    }
}
