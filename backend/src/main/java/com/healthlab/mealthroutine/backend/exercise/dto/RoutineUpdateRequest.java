package com.healthlab.mealthroutine.backend.exercise.dto;

import com.healthlab.mealthroutine.backend.exercise.domain.Difficulty;
import com.healthlab.mealthroutine.backend.exercise.domain.RoutineVisibility;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.List;

/** Null fields stay unchanged. When items is present it replaces the whole list. */
public record RoutineUpdateRequest(
        @Size(min = 1, max = 160) String routineName,
        String description,
        Difficulty difficulty,
        RoutineVisibility visibility,
        @Size(min = 1, max = 100) List<@Valid RoutineItemRequest> items) {
}
