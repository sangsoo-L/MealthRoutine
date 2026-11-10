package com.healthlab.mealthroutine.backend.exercise.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.healthlab.mealthroutine.backend.common.LowerCaseEnumConverter;
import jakarta.persistence.Converter;

public enum EquipmentPreference {
    @JsonProperty("body") BODY,
    @JsonProperty("dumbbell") DUMBBELL,
    @JsonProperty("band") BAND;

    @Converter(autoApply = true)
    public static class DbConverter extends LowerCaseEnumConverter<EquipmentPreference> {
        public DbConverter() {
            super(EquipmentPreference.class);
        }
    }
}
