package com.healthlab.mealthroutine.backend.reward.dto;

import com.healthlab.mealthroutine.backend.reward.domain.PointTransaction;
import com.healthlab.mealthroutine.backend.reward.domain.PointTransactionType;

import java.time.LocalDateTime;

public record PointTransactionResponse(Long id, int amount , PointTransactionType type,
                                       String sourceType, LocalDateTime createdAt) {
    public static PointTransactionResponse from(PointTransaction t){
        return new PointTransactionResponse(t.getPointTransactionId(),t.getAmount(),
                t.getTransactionType(),t.getSourceType(),t.getCreatedAt());
    }
}
