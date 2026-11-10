package com.healthlab.mealthroutine.backend.exercise.dto;

import com.healthlab.mealthroutine.backend.exercise.domain.Difficulty;
import com.healthlab.mealthroutine.backend.exercise.domain.RoutineVisibility;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

public record RoutineCreateRequest(
        @NotBlank @Size(max = 160) String routineName,
        String description,
        Difficulty difficulty,
        RoutineVisibility visibility,
        @NotEmpty @Size(max = 100) List<@Valid RoutineItemRequest> items) {
}
