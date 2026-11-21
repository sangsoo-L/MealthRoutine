package com.healthlab.mealthroutine.backend.quiz.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.LoginUser;
import com.healthlab.mealthroutine.backend.quiz.dto.QuizAttemptRequest;
import com.healthlab.mealthroutine.backend.quiz.dto.QuizResultResponse;
import com.healthlab.mealthroutine.backend.quiz.dto.TodayQuizResponse;
import com.healthlab.mealthroutine.backend.quiz.service.QuizService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/quizzes/today")
public class QuizController {

    private final QuizService quizService;

    @GetMapping // 오늘의 문제 (안 풀었으면 정답 숨김)
    public ApiResponse<TodayQuizResponse> getToday(@LoginUser Long userId){
        return ApiResponse.ok(quizService.getToday(userId));
    }

    @PostMapping("/attempt")
    public ApiResponse<QuizResultResponse> submit(@LoginUser Long userId,
                                                  @Valid@RequestBody QuizAttemptRequest req){
        return ApiResponse.ok(quizService.submit(userId,req.answer()));
    }

}
