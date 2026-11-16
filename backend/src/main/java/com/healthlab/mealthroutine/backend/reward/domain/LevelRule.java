package com.healthlab.mealthroutine.backend.reward.domain;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name="level_rules")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LevelRule {

    @Id@GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long levelRuleId;

    private int levelNumber; // 레벨
    private long requiredTotalXp; // 이 경험치 이상이면 이 레벨
    private String levelName;

    @JdbcTypeCode(SqlTypes.JSON)
    private String benefits;

}
