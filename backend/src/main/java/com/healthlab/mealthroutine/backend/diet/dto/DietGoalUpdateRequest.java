package com.healthlab.mealthroutine.backend.diet.dto;

import com.healthlab.mealthroutine.backend.exercise.domain.GoalStatus;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;

public record DietGoalUpdateRequest (
        @Positive BigDecimal targetCaloriesKcal,            // 수정은 전부 선택
        @Positive BigDecimal targetWeightKg,
        @PositiveOrZero BigDecimal targetProteinG,
        @PositiveOrZero BigDecimal targetCarbohydrateG,
        @PositiveOrZero BigDecimal targetFatG,
        @PositiveOrZero BigDecimal targetSugarG,
        @PositiveOrZero BigDecimal targetSodiumMg,
        LocalDate endDate,
        GoalStatus status                                   // paused, cancelled 등으로 변경
){}
