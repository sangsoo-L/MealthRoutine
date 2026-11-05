package com.healthlab.mealthroutine.backend.exercise.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.LoginUser;
import com.healthlab.mealthroutine.backend.exercise.dto.GoalCreateRequest;
import com.healthlab.mealthroutine.backend.exercise.dto.GoalResponse;
import com.healthlab.mealthroutine.backend.exercise.dto.GoalUpdateRequest;
import com.healthlab.mealthroutine.backend.exercise.service.ExerciseGoalService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/exercise-goals")
public class ExerciseGoalController {

    private final ExerciseGoalService goalService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<GoalResponse> create(@LoginUser Long userId, @Valid @RequestBody GoalCreateRequest request) {
        return ApiResponse.ok(goalService.create(userId, request));
    }

    @GetMapping
    public ApiResponse<List<GoalResponse>> getAll(@LoginUser Long userId) {
        return ApiResponse.ok(goalService.getAll(userId));
    }

    @PatchMapping("/{goalId}")
    public ApiResponse<GoalResponse> update(@LoginUser Long userId, @PathVariable Long goalId,
            @Valid @RequestBody GoalUpdateRequest request) {
        return ApiResponse.ok(goalService.update(userId, goalId, request));
    }
}
