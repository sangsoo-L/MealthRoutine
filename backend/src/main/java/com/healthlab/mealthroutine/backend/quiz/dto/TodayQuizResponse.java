package com.healthlab.mealthroutine.backend.quiz.dto;

public record TodayQuizResponse(Long quizId , String quesion, String topic,
                                boolean solved,  // 오늘 풀었는지
                                QuizResultResponse result) {  // 안 풀었으면 null (정답 숨김)
}
