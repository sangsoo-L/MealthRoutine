package com.healthlab.mealthroutine.backend.diet.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.LoginUser;
import com.healthlab.mealthroutine.backend.diet.dto.FoodResponse;
import com.healthlab.mealthroutine.backend.diet.service.FoodService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/users/me/favorite-foods")
public class FavoriteFoodController {

    private final FoodService foodService;

    @GetMapping // 내 즐겨찾기 목록
    public ApiResponse<List<FoodResponse>> getFavorites(@LoginUser Long userId){
        return ApiResponse.ok(foodService.getFavorites(userId));
    }

    @PutMapping("/{foodId}") // 등록 (여러 번 눌러도 하나만)
    public ApiResponse<Void> addFavorite(@LoginUser Long userId, @PathVariable Long foodId){
        foodService.addFavorite(userId, foodId);
        return ApiResponse.ok();
    }

    @DeleteMapping("/{foodId}") //해제
    public ApiResponse<Void> removeFavorite(@LoginUser Long userId,@PathVariable Long foodId){
        foodService.removeFavorite(userId,foodId);
        return ApiResponse.ok();
    }

}
