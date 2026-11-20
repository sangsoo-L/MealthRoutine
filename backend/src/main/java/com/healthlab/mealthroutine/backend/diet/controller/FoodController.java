package com.healthlab.mealthroutine.backend.diet.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.PageResponse;
import com.healthlab.mealthroutine.backend.diet.dto.FoodResponse;
import com.healthlab.mealthroutine.backend.diet.service.FoodService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/foods")
public class FoodController {

    private final FoodService foodService;

    @GetMapping
    public ApiResponse<PageResponse<FoodResponse>> search(
            @RequestParam(defaultValue = "") String keyword,
            @PageableDefault(size = 20) Pageable pageable) {
        return ApiResponse.ok(PageResponse.from(foodService.search(keyword, pageable)));
    }

    @GetMapping("/{foodId}")
    public ApiResponse<FoodResponse> get(@PathVariable Long foodId) {
        return ApiResponse.ok(foodService.get(foodId));
    }
}