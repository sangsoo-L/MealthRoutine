package com.healthlab.mealthroutine.backend.exercise.dto;

import com.healthlab.mealthroutine.backend.exercise.domain.EquipmentPreference;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

public record GoalCreateRequest(
        @NotBlank @Size(max = 160) String goalName,
        @DecimalMin("0") @Digits(integer = 8, fraction = 2) BigDecimal targetValue,
        @NotNull LocalDate startDate,
        LocalDate endDate,
        @NotNull @Min(1) Short exerciseMin,
        EquipmentPreference preferenceExerciseEquipment) {
}
