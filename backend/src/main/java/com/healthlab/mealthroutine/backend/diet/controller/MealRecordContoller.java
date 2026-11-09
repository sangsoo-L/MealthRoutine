package com.healthlab.mealthroutine.backend.diet.controller;

import com.healthlab.mealthroutine.backend.diet.domain.MealRecord;
import com.healthlab.mealthroutine.backend.diet.dto.MealRecordCreateRequest;
import com.healthlab.mealthroutine.backend.diet.dto.MealRecordResponse;
import com.healthlab.mealthroutine.backend.diet.service.MealRecordService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/meal-records")
public class MealRecordContoller {

    private final MealRecordService mealRecordService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)  // 저장 성공 시 201
    public MealRecordResponse create(
            @RequestHeader("X-User-Id")Long userId,  // 로그인 전 임시: 헤더로 회원 번호 받기
            @Valid @RequestBody MealRecordCreateRequest request){// JSON 본문 + 검증
        return mealRecordService.create(userId,request);
    }
    //curl -X POST http://localhost:8080/api/v1/meal-records -H "Content-Type: application/json" -H "X-User-Id: 1" -d @meal-test.json
}
