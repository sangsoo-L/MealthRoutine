package com.healthlab.mealthroutine.backend.reward.domain;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name="point_transactions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PointTransaction {
    @Id@GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long pointTransactionId;

    private Long userId;
    private int amount;
    @Column(nullable = false)
    private PointTransactionType transactionType;
    private String sourceType;
    private String description;
    private String pointIdempotencyKey;
    private LocalDateTime createdAt = LocalDateTime.now();

    public static PointTransaction earn(Long userId , int amount , String sourceType , String key){
        PointTransaction t = new PointTransaction();
        t.userId = userId;
        t.amount = amount;
        t.transactionType = PointTransactionType.EARN; // 지급 earn 고정
        t.sourceType = sourceType;
        t.pointIdempotencyKey = key;
        return t;
    }
}
