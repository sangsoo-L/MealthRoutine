package com.healthlab.mealthroutine.backend.reward.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.LoginUser;
import com.healthlab.mealthroutine.backend.reward.service.DailyScoreService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.ZoneId;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/daily-score")
public class DailyScoreController {

    private final DailyScoreService dailyScoreService;

    @GetMapping
    public ApiResponse<DailyScoreService.DailyScore> get(
            @LoginUser Long userId,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)LocalDate date){ // yyyy-MM-dd 형식
        LocalDate target = (date != null) ? date : LocalDate.now(ZoneId.of("Asia/Seoul")); // 안 보내면 오늘
        return ApiResponse.ok(dailyScoreService.calculate(userId,target));
    }




}
