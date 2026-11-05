package com.healthlab.mealthroutine.backend.exercise.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.healthlab.mealthroutine.backend.common.LowerCaseEnumConverter;
import jakarta.persistence.Converter;

public enum SessionStatus {
    @JsonProperty("standby") STANDBY,
    @JsonProperty("in_progress") IN_PROGRESS,
    @JsonProperty("completed") COMPLETED,
    @JsonProperty("interrupted") INTERRUPTED,
    @JsonProperty("cancelled") CANCELLED;

    public boolean isFinished() {
        return this == COMPLETED || this == INTERRUPTED || this == CANCELLED;
    }

    @Converter(autoApply = true)
    public static class DbConverter extends LowerCaseEnumConverter<SessionStatus> {
        public DbConverter() {
            super(SessionStatus.class);
        }
    }
}
