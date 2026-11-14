package com.healthlab.mealthroutine.backend.diet.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.healthlab.mealthroutine.backend.common.LowerCaseEnumConverter;
import jakarta.persistence.Converter;

public enum MealType {
    @JsonProperty("breakfast") BREAKFAST,
    @JsonProperty("lunch") LUNCH,
    @JsonProperty("dinner") DINNER,
    @JsonProperty("snack") SNACK,
    @JsonProperty("other") OTHER;

    @Converter(autoApply = true)            // DB 저장/조회 시 자동 적용
    public static class DbConverter extends LowerCaseEnumConverter<MealType> {
        public DbConverter() {
            super(MealType.class);          // 어떤 enum인지 알려줌
        }
    }
}