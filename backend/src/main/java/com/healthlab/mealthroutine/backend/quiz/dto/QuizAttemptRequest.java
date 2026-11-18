package com.healthlab.mealthroutine.backend.quiz.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record QuizAttemptRequest(
        @NotNull@Pattern(regexp = "[OX]") String answer // O 또는 x만
) {
}
