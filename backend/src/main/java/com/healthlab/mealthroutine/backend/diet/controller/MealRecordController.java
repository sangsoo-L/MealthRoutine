package com.healthlab.mealthroutine.backend.diet.controller;

import com.healthlab.mealthroutine.backend.diet.domain.MealRecord;
import com.healthlab.mealthroutine.backend.diet.domain.RecordType;
import com.healthlab.mealthroutine.backend.diet.dto.MealRecordCreateRequest;
import com.healthlab.mealthroutine.backend.diet.dto.MealRecordResponse;
import com.healthlab.mealthroutine.backend.diet.service.MealRecordService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/meal-records")
public class MealRecordController {
    // TODO: 로그인 구현 후 @AuthenticationPrincipal로 교체
    private final MealRecordService mealRecordService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)  // 저장 성공 시 201
    public MealRecordResponse create(
            @RequestHeader("X-User-Id")Long userId,  // 로그인 전 임시: 헤더로 회원 번호 받기
            @Valid @RequestBody MealRecordCreateRequest request){// JSON 본문 + 검증
        return mealRecordService.create(userId,request);
    }
    //curl -X POST http://localhost:8080/api/v1/meal-records -H "Content-Type: application/json" -H "X-User-Id: 1" -d @meal-test.json

    @GetMapping //&recordType=PLAN 내일플랜볼수있음
    public List<MealRecordResponse> getDaily(@RequestHeader("X-User-Id")Long userId,
                                             @RequestParam@DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate date,
                                             @RequestParam(defaultValue="ACTUAL")RecordType recordType
                                             ){
        return mealRecordService.getDaily(userId, date, recordType);
    }
    // curl -H "X-User-Id: 1" "http://localhost:8080/api/v1/meal-records?date=2026-11-09"


    @GetMapping("/{mealRecordId}")
    public MealRecordResponse get(

            @RequestHeader("X-User-Id")Long userId,
            @PathVariable Long mealRecordId
    ){
        return mealRecordService.get(userId,mealRecordId);
    }

    @DeleteMapping("/{mealRecordId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@RequestHeader("X-User-Id")Long userId,
                       @PathVariable Long mealRecordId
                       ){
        mealRecordService.delete(userId,mealRecordId);
    } //curl -X DELETE -H "X-User-Id: 1" http://localhost:8080/api/v1/meal-records/1

}
