package com.healthlab.mealthroutine.backend.exercise.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.healthlab.mealthroutine.backend.common.LowerCaseEnumConverter;
import jakarta.persistence.Converter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
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

    /**
     * Reads the allowed_record_modes JSON column. Returns null when the column is empty or does not hold a non-empty
     * list of known codes without repeats, so a bad row is sent as "no record-mode data" instead of failing the request.
     */
    public static List<CatalogRecordMode> readAllowed(String json) {
        if (json == null) {
            return null;
        }
        JsonNode node;
        try {
            node = MAPPER.readTree(json);
        } catch (JacksonException e) {
            return null;
        }
        if (node == null || !node.isArray() || node.isEmpty()) {
            return null;
        }
        // Read each element as a JSON string and match the code exactly. Binding straight to the enum would let Jackson
        // take a number (1) or a string of digits ("1") as a position in the enum list.
        List<CatalogRecordMode> modes = new ArrayList<>();
        for (JsonNode item : node) {
            CatalogRecordMode mode = item.isString() ? fromCode(item.asString()) : null;
            if (mode == null || modes.contains(mode)) {
                return null;
            }
            modes.add(mode);
        }
        return List.copyOf(modes);
    }

    /** The catalog code, e.g. {@code weight_reps}. */
    public String code() {
        return name().toLowerCase(Locale.ROOT);
    }

    private static CatalogRecordMode fromCode(String code) {
        for (CatalogRecordMode mode : values()) {
            if (mode.code().equals(code)) {
                return mode;
            }
        }
        return null;
    }

    @Converter(autoApply = true)
    public static class DbConverter extends LowerCaseEnumConverter<CatalogRecordMode> {
        public DbConverter() {
            super(CatalogRecordMode.class);
        }
    }
}
