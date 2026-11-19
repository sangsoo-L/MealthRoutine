package com.healthlab.mealthroutine.backend.diet.dto;

import com.healthlab.mealthroutine.backend.diet.domain.DietGoal;
import com.healthlab.mealthroutine.backend.exercise.domain.GoalStatus;

import java.math.BigDecimal;
import java.time.LocalDate;

public record DietGoalResponse(
        Long dietGoalId,
        BigDecimal targetCaloriesKcal, BigDecimal targetWeightKg,
        BigDecimal targetProteinG, BigDecimal targetCarbohydrateG, BigDecimal targetFatG,
        BigDecimal targetSugarG, BigDecimal targetSodiumMg,
        LocalDate startDate, LocalDate endDate,
        GoalStatus status
) {
    public static DietGoalResponse from(DietGoal g) {
        return new DietGoalResponse(
                g.getDietGoalId(),
                g.getTargetCaloriesKcal(), g.getTargetWeightKg(),
                g.getTargetProteinG(), g.getTargetCarbohydrateG(), g.getTargetFatG(),
                g.getTargetSugarG(), g.getTargetSodiumMg(),
                g.getStartDate(), g.getEndDate(),
                g.getStatus());
    }
}
