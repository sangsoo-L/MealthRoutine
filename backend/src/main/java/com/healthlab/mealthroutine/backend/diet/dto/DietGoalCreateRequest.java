package com.healthlab.mealthroutine.backend.diet.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;

public record DietGoalCreateRequest(
        @NotNull @Positive BigDecimal targetCaloriesKcal,   // 목표 칼로리는 필수, 0보다 커야 함
        @Positive BigDecimal targetWeightKg,                // 나머지는 선택
        @PositiveOrZero BigDecimal targetProteinG,
        @PositiveOrZero BigDecimal targetCarbohydrateG,
        @PositiveOrZero BigDecimal targetFatG,
        @PositiveOrZero BigDecimal targetSugarG,
        @PositiveOrZero BigDecimal targetSodiumMg,
        LocalDate startDate,                                // 안 보내면 오늘
        LocalDate endDate
) {}
