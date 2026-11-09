package com.healthlab.mealthroutine.backend.exercise.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.healthlab.mealthroutine.backend.common.LowerCaseEnumConverter;
import jakarta.persistence.Converter;

public enum GoalStatus {
    @JsonProperty("active") ACTIVE,
    @JsonProperty("completed") COMPLETED,
    @JsonProperty("paused") PAUSED,
    @JsonProperty("cancelled") CANCELLED;

    @Converter(autoApply = true)
    public static class DbConverter extends LowerCaseEnumConverter<GoalStatus> {
        public DbConverter() {
            super(GoalStatus.class);
        }
    }
}
