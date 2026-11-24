package com.healthlab.mealthroutine.backend.exercise.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.healthlab.mealthroutine.backend.common.LowerCaseEnumConverter;
import jakarta.persistence.Converter;
import java.util.List;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * How the exercise catalog says an exercise can be recorded (exercises.default_record_mode / allowed_record_modes).
 * Same codes as the frontend catalog (recordMode.ts CatalogRecordMode): weight+reps is {@code weight_reps} here, while
 * routines and sessions store it as {@code weight} (WorkoutRecordType).
 */
public enum CatalogRecordMode {
    @JsonProperty("time") TIME,
    @JsonProperty("reps") REPS,
    @JsonProperty("weight_reps") WEIGHT_REPS,
    @JsonProperty("time_reps") TIME_REPS,
    @JsonProperty("weight_time") WEIGHT_TIME;

    private static final JsonMapper MAPPER = JsonMapper.builder().build();
    private static final TypeReference<List<CatalogRecordMode>> LIST = new TypeReference<>() {
    };

    /**
     * Reads the allowed_record_modes JSON column. Returns null when the column is empty or does not hold a non-empty
     * list of known codes without repeats, so a bad row is sent as "no record-mode data" instead of failing the request.
     */
    public static List<CatalogRecordMode> readAllowed(String json) {
        if (json == null) {
            return null;
        }
        try {
            List<CatalogRecordMode> modes = MAPPER.readValue(json, LIST);
            if (modes == null || modes.isEmpty() || modes.contains(null) || modes.stream().distinct().count() != modes.size()) {
                return null;
            }
            return List.copyOf(modes);
        } catch (JacksonException e) {
            return null;
        }
    }

    @Converter(autoApply = true)
    public static class DbConverter extends LowerCaseEnumConverter<CatalogRecordMode> {
        public DbConverter() {
            super(CatalogRecordMode.class);
        }
    }
}
