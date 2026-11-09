package com.healthlab.mealthroutine.backend.exercise.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import java.util.List;

/** Null fields stay unchanged. When exercises is present it replaces the whole list. */
public record SessionUpdateRequest(
        LocalDateTime startedAt,
        LocalDateTime endedAt,
        @Min(1) @Max(5) Byte feedbackRating,
        @Size(max = 1000) String feedbackNote,
        @Size(max = 100) List<@Valid SessionExerciseRequest> exercises) {
}
