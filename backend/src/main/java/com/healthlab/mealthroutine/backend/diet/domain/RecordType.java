package com.healthlab.mealthroutine.backend.diet.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.healthlab.mealthroutine.backend.common.LowerCaseEnumConverter;
import jakarta.persistence.Converter;

public enum RecordType {
    @JsonProperty("plan") PLAN,
    @JsonProperty("actual") ACTUAL;

    @Converter(autoApply = true)
    public static class DbConverter extends LowerCaseEnumConverter<RecordType> {
        public DbConverter() {
            super(RecordType.class);
        }
    }
}
