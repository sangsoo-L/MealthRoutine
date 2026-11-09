package com.healthlab.mealthroutine.backend.exercise.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;

public record SessionExerciseRequest(
        @NotNull Long exerciseId,
        Long exerciseRoutineItemId,
        @Size(max = 100) List<@Valid SetRequest> sets) {

    public record SetRequest(
            @Min(0) Short reps,
            @DecimalMin("0") @Digits(integer = 5, fraction = 2) BigDecimal weightKg,
            @Min(0) Integer durationSeconds,
            @DecimalMin("0") @Digits(integer = 7, fraction = 2) BigDecimal distanceM,
            @Min(0) Integer restSeconds) {
    }
}
