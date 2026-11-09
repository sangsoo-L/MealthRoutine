package com.healthlab.mealthroutine.backend.exercise.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.healthlab.mealthroutine.backend.common.LowerCaseEnumConverter;
import jakarta.persistence.Converter;

public enum Difficulty {
    @JsonProperty("beginner") BEGINNER,
    @JsonProperty("intermediate") INTERMEDIATE,
    @JsonProperty("advanced") ADVANCED;

    @Converter(autoApply = true)
    public static class DbConverter extends LowerCaseEnumConverter<Difficulty> {
        public DbConverter() {
            super(Difficulty.class);
        }
    }
}
