package com.healthlab.mealthroutine.backend.diet.dto;

import com.healthlab.mealthroutine.backend.diet.domain.Food;
import com.healthlab.mealthroutine.backend.diet.domain.MealRecord;
import com.healthlab.mealthroutine.backend.diet.domain.MealRecordItem;
import com.healthlab.mealthroutine.backend.diet.domain.MealType;
import com.healthlab.mealthroutine.backend.diet.domain.RecordType;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record MealRecordResponse(
        Long mealRecordId,
        LocalDateTime mealAt,
        MealType mealType,
        RecordType recordType,
        BigDecimal totalCaloriesKcal,
        BigDecimal totalCarbohydrateG,
        BigDecimal totalProteinG,
        BigDecimal totalFatG,
        BigDecimal totalSugarG,
        BigDecimal totalSodiumMg,
        String notes,
        List<ItemResponse> items
) {
    public static MealRecordResponse from(MealRecord r){
        return new MealRecordResponse(
                r.getMealRecordId(),r.getMealAt(),r.getMealType(),r.getRecordType(),
                r.getTotalCaloriesKcal(),r.getTotalCarbohydrateG(),r.getTotalProteinG(),
                r.getTotalFatG(),r.getTotalSugarG(),r.getTotalSodiumMg(),
                r.getNotes(),
                r.getItems().stream().map(ItemResponse::from).toList()); // 아이템도 DTO로
    }
    public record ItemResponse(
            Long mealItemId,
            Long foodId,        // 원본 음식 id (음식이 지워졌으면 null) - 프론트 수정 기능용
            String foodName, BigDecimal quantity,
            BigDecimal amountG, // 먹은 양(g) = 인분 × 1인분 중량 - 프론트는 그램 단위로 보여줌
            BigDecimal caloriesKcal, BigDecimal carbohydrateG, BigDecimal proteinG,
            BigDecimal fatG, BigDecimal sugarG, BigDecimal sodiumMg
    ){
        static ItemResponse from(MealRecordItem i){
            Food f = i.getFood();
            BigDecimal amountG = f == null ? null // 1인분 = referenceServingSize, 없으면 servingSize (Food.ratioFor와 같은 기준)
                    : i.getQuantity().multiply(f.getReferenceServingSize() != null ? f.getReferenceServingSize() : f.getServingSize());
            return new ItemResponse(
                    i.getMealItemId(), f == null ? null : f.getFoodId(),
                    i.getFoodNameSnapshot(), i.getQuantity(), amountG,
                    i.getCaloriesKcal(),i.getCarbohydrateG(),i.getProteinG(),
                    i.getFatG(),i.getSugarG(),i.getSodiumMg());
        }
    }
}
