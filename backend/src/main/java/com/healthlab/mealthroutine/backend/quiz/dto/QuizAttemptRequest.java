package com.healthlab.mealthroutine.backend.quiz.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record QuizAttemptRequest(
        @NotNull@Pattern(regexp = "[OXABCD]") String answer, // OX + 4지선다
        Long questionId // 화면에 띄운 문제 id (자정을 넘겨 제출하면 오늘 문제와 달라 거절). 없으면 확인 생략
) {
}
