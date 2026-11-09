package com.healthlab.mealthroutine.backend.exercise.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.healthlab.mealthroutine.backend.common.LowerCaseEnumConverter;
import jakarta.persistence.Converter;

public enum RoutineVisibility {
    @JsonProperty("private") PRIVATE,
    @JsonProperty("shared") SHARED,
    @JsonProperty("public") PUBLIC;

    @Converter(autoApply = true)
    public static class DbConverter extends LowerCaseEnumConverter<RoutineVisibility> {
        public DbConverter() {
            super(RoutineVisibility.class);
        }
    }
}
