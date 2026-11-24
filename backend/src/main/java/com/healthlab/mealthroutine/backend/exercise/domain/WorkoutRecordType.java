package com.healthlab.mealthroutine.backend.exercise.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.healthlab.mealthroutine.backend.common.LowerCaseEnumConverter;
import jakarta.persistence.Converter;

/**
 * How an exercise is recorded. Same codes as the frontend's stored RecordType (workoutDraftTypes.ts): weight+reps is
 * {@code weight}, not the catalog code {@code weight_reps}. Which set fields each type allows is in SetTargetValidator.
 */
public enum WorkoutRecordType {
    @JsonProperty("reps") REPS,
    @JsonProperty("weight") WEIGHT,
    @JsonProperty("time") TIME,
    @JsonProperty("time_reps") TIME_REPS,
    @JsonProperty("weight_time") WEIGHT_TIME;

    @Converter(autoApply = true)
    public static class DbConverter extends LowerCaseEnumConverter<WorkoutRecordType> {
        public DbConverter() {
            super(WorkoutRecordType.class);
        }
    }
}
