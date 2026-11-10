package com.healthlab.mealthroutine.backend.diet.dto;

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
            Long mealItemId, String foodName, BigDecimal quantity,
            BigDecimal caloriesKcal, BigDecimal carbohydrateG, BigDecimal proteinG,
            BigDecimal fatG, BigDecimal sugarG, BigDecimal sodiumMg
    ){
        static ItemResponse from(MealRecordItem i){
            return new ItemResponse(
                    i.getMealItemId(), i.getFoodNameSnapshot(), i.getQuantity(),
                    i.getCaloriesKcal(),i.getCarbohydrateG(),i.getProteinG(),
                    i.getFatG(),i.getSugarG(),i.getSodiumMg());
        }
    }
}
