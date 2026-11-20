package com.healthlab.mealthroutine.backend.quiz.dto;

import com.fasterxml.jackson.annotation.JsonRawValue;

public record TodayQuizResponse(Long quizId , String question, String topic,
                                String questionType,             // 추가: 문제 유형
                                @JsonRawValue String options,    // 추가: 문자열이 아니라 JSON 배열로 내보냄
                                boolean solved,  // 오늘 풀었는지
                                QuizResultResponse result) {  // 안 풀었으면 null (정답 숨김)
}
