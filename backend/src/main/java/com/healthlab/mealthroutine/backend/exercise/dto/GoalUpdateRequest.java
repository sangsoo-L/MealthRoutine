package com.healthlab.mealthroutine.backend.exercise.dto;

import com.healthlab.mealthroutine.backend.exercise.domain.EquipmentPreference;
import com.healthlab.mealthroutine.backend.exercise.domain.GoalStatus;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

/** Null fields stay unchanged. */
public record GoalUpdateRequest(
        @Size(min = 1, max = 160) String goalName,
        @DecimalMin("0") @Digits(integer = 8, fraction = 2) BigDecimal targetValue,
        LocalDate startDate,
        LocalDate endDate,
        @Min(1) Short exerciseMin,
        GoalStatus status,
        EquipmentPreference preferenceExerciseEquipment) {
}
