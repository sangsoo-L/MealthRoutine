package com.healthlab.mealthroutine.backend.exercise.dto;

import com.healthlab.mealthroutine.backend.exercise.domain.Difficulty;
import com.healthlab.mealthroutine.backend.exercise.domain.RoutineVisibility;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import tools.jackson.databind.annotation.JsonDeserialize;

/**
 * {@code requestId} is optional. When sent, repeating the same request returns the routine it created (200,
 * created=false) and the same id with different content is 409 REQUEST_CONFLICT.
 */
public record RoutineCreateRequest(
        @NotBlank @Size(max = 160) String routineName,
        String description,
        Difficulty difficulty,
        RoutineVisibility visibility,
        @JsonDeserialize(using = BoundedListDeserializer.RoutineItems.class)
        @NotEmpty @Size(max = 100) List<@NotNull @Valid RoutineItemRequest> items,
        @Pattern(regexp = "^[0-9A-Za-z_-]{1,100}$") String requestId) {
}
