package com.healthlab.mealthroutine.backend.diet.domain;
import java.math.BigDecimal;
import java.math.RoundingMode;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name="meal_record_items")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MealRecordItem{

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name="meal_item_id")
    private Long mealItemId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "meal_record_id",nullable = false) // 어느 끼니에 속하는지 (FK)
    private MealRecord mealRecord;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name="food_id")
    private Food food;  // 원본 음식 (삭제돼도 기록은 남게 null 허용)

    @Column(nullable = false,length = 200)
    private String foodNameSnapshot; // 기록 당시 음식 이름 복사

    @Column(nullable = false,precision= 8 , scale = 2)
    private BigDecimal quantity; // 인분 수

    @Column(precision = 9,scale = 2)
    private BigDecimal caloriesKcal;

    @Column(name="carbohydrate_g",precision = 8,scale = 2)
    private BigDecimal carbohydrateG;

    @Column(name="protein_g",precision = 8 , scale = 2)
    private BigDecimal proteinG;

    @Column(name="fat_g",precision = 8 , scale = 2)
    private BigDecimal fatG;

    @Column(name="sugar_g" ,precision = 8 , scale = 2)
    private BigDecimal sugarG;

    @Column(precision = 8 , scale = 2)
    private BigDecimal sodiumMg;

    // 음식 + 인분수 -> 영양소 계산해서 아이템 생성
    public static MealRecordItem of(Food food, BigDecimal quantity){
        BigDecimal ratio = food.ratioFor(quantity);

        MealRecordItem item = new MealRecordItem();
        item.food = food;
        item.foodNameSnapshot = food.getName();   // 기록 당시 이름 복사
        item.quantity = quantity;
        item.caloriesKcal = calc(food.getCaloriesKcal(),ratio);
        item.carbohydrateG = calc(food.getCarbohydrateG(),ratio);
        item.proteinG = calc(food.getProteinG(),ratio);
        item.fatG = calc(food.getFatG(),ratio);
        item.sugarG = calc(food.getSugarG(),ratio);
        item.sodiumMg = calc(food.getSodiumMg(),ratio);
        return item;
    }

    // 영양소 x 비율 (값이 없는 영양소는 null 그대로)
    private static BigDecimal calc(BigDecimal value, BigDecimal ratio){
        if(value == null)return null;
        return value.multiply(ratio) // value * ratio  ->  BigDecimal이 * 이안됨 multiply로 계산함
                .setScale(2, RoundingMode.HALF_UP);// 소수 둘째 자리 반올림
    }

    // 어느 끼니에 속하는지 연결 (MealRecord.addItem에서만 호출)
    void assignTo(MealRecord mealRecord){
        this.mealRecord = mealRecord;
    }

}
