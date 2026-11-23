package com.healthlab.mealthroutine.backend.reward.domain;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.sql.SQLType;

@Entity
@Table(name="reward_rules")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RewardRule {

    @Id@GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long rewardRuleId;

    private String ruleCode; // MEAL_RECORDED 같은 규칙 이름표
    private String ruleDescription;
    private int pointsAmount; // 줄 포인트
    private int xpAmount; // 줄 경험치

    @JdbcTypeCode(SqlTypes.JSON) // DB 컬럼이 JSON 타입이라 필요 (없으면 validate 오류)
    private String conditionsJson; // {"dailyLimit": 3} 문자열 그대로 받기

    private boolean isActive; // 꺼둔 규칙이면 지급 안 함
}
