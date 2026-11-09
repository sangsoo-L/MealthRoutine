package com.healthlab.mealthroutine.backend.exercise.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record RoutineItemRequest(
        @NotNull Long exerciseId,
        @NotNull @Min(1) Short targetSets,
        @Min(0) Short targetReps,
        @Min(0) Integer targetDurationSeconds,
        @Min(0) Integer restSeconds) {
}
