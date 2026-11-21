package com.healthlab.mealthroutine.backend.quiz.dto;

public record QuizResultResponse(boolean correct, String answer,String explanation) { // 채점 결과 + 정답·해설
}
