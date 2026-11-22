package com.healthlab.mealthroutine.backend.quiz.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record QuizAttemptRequest(
        @NotNull@Pattern(regexp = "[OXABCD]") String answer // OX + 4지선다
) {
}
