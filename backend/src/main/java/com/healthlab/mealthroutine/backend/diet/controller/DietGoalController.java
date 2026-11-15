package com.healthlab.mealthroutine.backend.diet.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.LoginUser;
import com.healthlab.mealthroutine.backend.diet.dto.DietGoalCreateRequest;
import com.healthlab.mealthroutine.backend.diet.dto.DietGoalResponse;
import com.healthlab.mealthroutine.backend.diet.dto.DietGoalUpdateRequest;
import com.healthlab.mealthroutine.backend.diet.service.DietGoalService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/diet-goals")
public class DietGoalController {

    private final DietGoalService dietGoalService;

    @PostMapping // 목표 생성
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<DietGoalResponse> create(@LoginUser Long userId,
                                                @Valid @RequestBody DietGoalCreateRequest request){
        return ApiResponse.ok(dietGoalService.create(userId,request));
    }

    @GetMapping // 진행 중 목표 조회
    public ApiResponse<DietGoalResponse> getActive(@LoginUser Long userId){
        return ApiResponse.ok(dietGoalService.getActive(userId));
    }

    @PatchMapping("/{dietGoalId}")
    public ApiResponse<DietGoalResponse> update(@LoginUser Long userId,
                                                @PathVariable Long dietGoalId,
                                                @Valid @RequestBody DietGoalUpdateRequest request){
        return ApiResponse.ok(dietGoalService.update(userId,dietGoalId,request));
    }

}
