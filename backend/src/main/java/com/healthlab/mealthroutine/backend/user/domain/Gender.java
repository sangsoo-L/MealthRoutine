package com.healthlab.mealthroutine.backend.user.domain;

import com.healthlab.mealthroutine.backend.common.LowerCaseEnumConverter;
import jakarta.persistence.Converter;
import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;

/** Gender in user_profiles.gender. API and DB both use the lowercase value. */
public enum Gender {
    FEMALE,
    MALE,
    OTHER,
    UNDISCLOSED;

    public String apiValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    /** Exact lowercase match only: an upper-case or empty value does not match. */
    public static Optional<Gender> fromApiValue(String value) {
        return Arrays.stream(values()).filter(v -> v.apiValue().equals(value)).findFirst();
    }

    @Converter(autoApply = true)
    public static class DbConverter extends LowerCaseEnumConverter<Gender> {
        public DbConverter() {
            super(Gender.class);
        }
    }
}
