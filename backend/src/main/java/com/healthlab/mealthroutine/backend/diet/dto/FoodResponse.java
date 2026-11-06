package com.healthlab.mealthroutine.backend.diet.dto;

import com.healthlab.mealthroutine.backend.diet.domain.Food;

import java.math.BigDecimal;

// 값만담는 클래스
public record FoodResponse(
        Long foodId,
        String name,
        String brand,
        BigDecimal servingSize,
        String servingUnit,
        BigDecimal referenceServingSize,
        BigDecimal caloriesKcal,
        BigDecimal carbohydrateG,
        BigDecimal proteinG,
        BigDecimal fatG,
        BigDecimal sugarG,
        BigDecimal sodiumMg
) {
    // from -> 엔티티를 DTO로 바꿔주는 변환 메서드
    public static  FoodResponse from(Food f){
        return new FoodResponse(
                f.getFoodId(), f.getName() , f.getBrand(),
                f.getServingSize(),f.getServingUnit(), f.getReferenceServingSize(),
                f.getCaloriesKcal(),f.getCarbohydrateG(),f.getProteinG(),
                f.getFatG(),f.getSugarG(),f.getSodiumMg());
    }
}
