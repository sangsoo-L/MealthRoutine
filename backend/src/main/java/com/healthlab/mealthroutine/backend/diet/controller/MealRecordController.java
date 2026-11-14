package com.healthlab.mealthroutine.backend.diet.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.LoginUser;
import com.healthlab.mealthroutine.backend.diet.domain.RecordType;
import com.healthlab.mealthroutine.backend.diet.dto.MealRecordCreateRequest;
import com.healthlab.mealthroutine.backend.diet.dto.MealRecordResponse;
import com.healthlab.mealthroutine.backend.diet.dto.MealRecordUpdateRequest;
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
    private final MealRecordService mealRecordService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<MealRecordResponse> create(@LoginUser Long userId,
                                                  @Valid @RequestBody MealRecordCreateRequest request) {
        return ApiResponse.ok(mealRecordService.create(userId, request));
    }
    //curl -X POST http://localhost:8080/api/v1/meal-records -H "Content-Type: application/json" -H "X-User-Id: 1" -d @meal-test.json

    @GetMapping
    public ApiResponse<List<MealRecordResponse>> getDaily(@LoginUser Long userId,
                                                          @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                                                          @RequestParam(defaultValue = "actual") RecordType recordType) {
        return ApiResponse.ok(mealRecordService.getDaily(userId, date, recordType));
    }


    @GetMapping("/{mealRecordId}")
    public ApiResponse<MealRecordResponse> get(@LoginUser Long userId,
                                               @PathVariable Long mealRecordId) {
        return ApiResponse.ok(mealRecordService.get(userId, mealRecordId));
    }

    @PatchMapping("/{mealRecordId}")
    public ApiResponse<MealRecordResponse> update(@LoginUser Long userId,
                                                  @PathVariable Long mealRecordId,
                                                  @Valid @RequestBody MealRecordUpdateRequest request) {
        return ApiResponse.ok(mealRecordService.update(userId, mealRecordId, request));
    }



    @DeleteMapping("/{mealRecordId}")
    public ApiResponse<Void> delete(@LoginUser Long userId,
                                    @PathVariable Long mealRecordId) {
        mealRecordService.delete(userId, mealRecordId);
        return ApiResponse.ok();                     // 204 대신 200 + success: true
    }

}
