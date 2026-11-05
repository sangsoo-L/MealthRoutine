package com.healthlab.mealthroutine.backend.exercise.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import java.util.List;

/** Without exercises, a session started from a routine copies the routine's exercises. */
public record SessionCreateRequest(
        Long routineId,
        LocalDateTime startedAt,
        @Size(max = 100) List<@Valid SessionExerciseRequest> exercises) {
}
