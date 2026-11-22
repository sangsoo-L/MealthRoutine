package com.healthlab.mealthroutine.backend.reward.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.healthlab.mealthroutine.backend.common.LowerCaseEnumConverter;
import jakarta.persistence.Converter;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

// (식단 enum이랑 같은 패턴)
public enum PointTransactionType {
    @JsonProperty("earn") EARN , @JsonProperty("spend") SPEND,
    @JsonProperty("expire") EXPIRE, @JsonProperty("adjustment") ADJUSTMENT,
    @JsonProperty("refund") REFUND;

    @Converter(autoApply = true) // db에 소문자로 저장
    public static class DbConverter extends LowerCaseEnumConverter<PointTransactionType>{
        public DbConverter(){super(PointTransactionType.class);}
    }
}
