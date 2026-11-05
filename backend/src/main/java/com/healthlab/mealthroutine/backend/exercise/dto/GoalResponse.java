package com.healthlab.mealthroutine.backend.exercise.dto;

import com.healthlab.mealthroutine.backend.exercise.domain.EquipmentPreference;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseGoalEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.GoalStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record GoalResponse(Long exerciseGoalId, String goalName, BigDecimal targetValue, LocalDate startDate,
        LocalDate endDate, Short exerciseMin, GoalStatus status, EquipmentPreference preferenceExerciseEquipment,
        LocalDateTime createdAt) {

    public static GoalResponse from(ExerciseGoalEntity g) {
        return new GoalResponse(g.getExerciseGoalId(), g.getGoalName(), g.getTargetValue(), g.getStartDate(),
                g.getEndDate(), g.getExerciseMin(), g.getStatus(), g.getPreferenceExerciseEquipment(),
                g.getCreatedAt());
    }
}
