package com.healthlab.mealthroutine.backend.diet.controller;

import com.healthlab.mealthroutine.backend.diet.dto.FoodResponse;
import com.healthlab.mealthroutine.backend.diet.service.FoodService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/foods")
public class FoodController {

    private final FoodService foodService;

    @GetMapping
    public Page<FoodResponse> search( // 결과목록
            @RequestParam(defaultValue = "")String keyword,
            @PageableDefault(size=20) Pageable pageable){ // @RequestParam int page, @RequestParam int size, @RequestParam String sort
        // ex -> GET /api/v1/foods?keyword=닭가슴살&page=0&size=20 0페이지부터시작 다음은 page=1
        return foodService.search(keyword,pageable);
    }

    @GetMapping("/{foodId}") // GET /api/v1/foods/3 목록에서 눌럿을때 나오는정보
    public FoodResponse get(@PathVariable Long foodId){
        return foodService.get(foodId);
    }
}
