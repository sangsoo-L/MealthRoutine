package com.healthlab.mealthroutine.backend.diet.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.healthlab.mealthroutine.backend.common.LowerCaseEnumConverter;
import jakarta.persistence.Converter;

public enum RecordStatus { // 삭제 시 행을 지우지 않고 DELETED로 바꿈 (소프트삭제)
    @JsonProperty("draft") DRAFT,
    @JsonProperty("confirmed") CONFIRMED,
    @JsonProperty("deleted") DELETED;

    @Converter(autoApply = true)// DB 저장 시 소문자 변환
    public static class DbConverter extends LowerCaseEnumConverter<RecordStatus> {
        public DbConverter() {
            super(RecordStatus.class);
        }
    }
}
