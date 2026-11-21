package com.healthlab.mealthroutine.backend.reward.domain;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "experience_transactions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
// (경험치 지급 기록, 한 번 줄 때마다 한 줄씩 쌓임)
public class ExperienceTransaction {

    @Id@GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long experienceTransactionId;

    private Long userId;
    private int xpAmount;
    private String sourceType; // 어떤 규칙으로 받았는지 (MEAL_RECORDED)
    private String expIdempotencyKey; // 같은 키면 두 번 못 받음 (db 유니크)
    private LocalDateTime createdAt = LocalDateTime.now();

    public static ExperienceTransaction of(Long userId, int xp, String sourceType , String key){
        ExperienceTransaction t = new ExperienceTransaction();
        t.userId = userId;
        t.xpAmount = xp;
        t.sourceType = sourceType;
        t.expIdempotencyKey = key;
        return t;
    }

}
