package com.healthlab.mealthroutine.backend.exercise.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.LoginUser;
import com.healthlab.mealthroutine.backend.common.PageResponse;
import com.healthlab.mealthroutine.backend.exercise.domain.Difficulty;
import com.healthlab.mealthroutine.backend.exercise.dto.ExerciseResponse;
import com.healthlab.mealthroutine.backend.exercise.service.ExerciseService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1")
public class ExerciseController {

    private final ExerciseService exerciseService;

    @GetMapping("/exercises")
    public ApiResponse<PageResponse<ExerciseResponse>> search(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Difficulty difficulty,
            @RequestParam(required = false) String exerciseType,
            @RequestParam(required = false) String equipment,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return ApiResponse.ok(exerciseService.search(keyword, difficulty, exerciseType, equipment, page, size));
    }

    @GetMapping("/exercises/{exerciseId}")
    public ApiResponse<ExerciseResponse> get(@PathVariable Long exerciseId) {
        return ApiResponse.ok(exerciseService.get(exerciseId));
    }

    @GetMapping("/users/me/favorite-exercises")
    public ApiResponse<List<ExerciseResponse>> getFavorites(@LoginUser Long userId) {
        return ApiResponse.ok(exerciseService.getFavorites(userId));
    }

    @PutMapping("/users/me/favorite-exercises/{exerciseId}")
    public ApiResponse<Void> addFavorite(@LoginUser Long userId, @PathVariable Long exerciseId) {
        exerciseService.addFavorite(userId, exerciseId);
        return ApiResponse.ok();
    }

    @DeleteMapping("/users/me/favorite-exercises/{exerciseId}")
    public ApiResponse<Void> removeFavorite(@LoginUser Long userId, @PathVariable Long exerciseId) {
        exerciseService.removeFavorite(userId, exerciseId);
        return ApiResponse.ok();
    }
}
