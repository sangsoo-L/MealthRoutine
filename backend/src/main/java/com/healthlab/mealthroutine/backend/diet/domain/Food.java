package com.healthlab.mealthroutine.backend.diet.domain;

import com.healthlab.mealthroutine.backend.global.entity.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.math.RoundingMode;

@Table(name = "foods")
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED) // JPA용 기본 생성자, 외부에서 new 금지
public class Food extends BaseTimeEntity { // created_at, updated_at

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long foodId;

    @Column(nullable = false,length = 200)
    private String name;

    @Column(length = 160)
    private String brand;

    @Column(precision = 8, scale=2)  // DB에서 DECIMAL(8,2)로 만들어짐
    private BigDecimal servingSize;

    @Column(length = 30)
    private String servingUnit;

    @Column(precision = 8, scale = 2)
    private BigDecimal referenceServingSize;

    @Column(precision = 8,scale = 2)
    private BigDecimal caloriesKcal; // 기준량당 열량

    @Column(name = "carbohydrate_g", precision = 8,scale = 2)
    private BigDecimal carbohydrateG; // 탄수화물

    @Column(name = "protein_g", precision = 8,scale = 2)
    private BigDecimal proteinG; // 단백질

    @Column(name = "fat_g", precision = 8,scale = 2)
    private BigDecimal fatG; // 지방

    @Column(name = "sugar_g",precision = 8,scale = 2)
    private BigDecimal sugarG; // 당류

    @Column(precision = 8,scale = 2)
    private BigDecimal sodiumMg; // 나트륨 (mg)

    @Column(length = 255)
    private String externalFoodId; // 식약처 식품코드

    @ManyToOne(fetch = FetchType.LAZY) // 음식 여러 개 : 출처 하나
    @JoinColumn(name = "source_id")
    private FoodDataSource source;

    @Builder // 테스트 데이터, 식약처 적재 때 사용
    private Food(String name, String brand, BigDecimal servingSize, String servingUnit,
                 BigDecimal referenceServingSize, BigDecimal caloriesKcal,
                 BigDecimal carbohydrateG, BigDecimal proteinG, BigDecimal fatG,
                 BigDecimal sugarG, BigDecimal sodiumMg,
                 String externalFoodId, FoodDataSource source) {
        this.name = name;
        this.brand = brand;
        this.servingSize = servingSize;
        this.servingUnit = servingUnit;
        this.referenceServingSize = referenceServingSize;
        this.caloriesKcal = caloriesKcal;
        this.carbohydrateG = carbohydrateG;
        this.proteinG = proteinG;
        this.fatG = fatG;
        this.sugarG = sugarG;
        this.sodiumMg = sodiumMg;
        this.externalFoodId = externalFoodId;
        this.source = source;
    }

    // N인분 먹었을 때 기준량 대비 비율 ( 1인분이 200g 이면 , 식약품기준 100g단위이면 1.5인분인경우 300g -> 모든영양소에 3배)
    public BigDecimal ratioFor(BigDecimal servings){
        BigDecimal portion = referenceServingSize != null ? referenceServingSize : servingSize; // 1인분 정보가 없으면 기준량을 1인분으로
        return portion.multiply(servings) // -> 여기서 인분계산 BigDecimal은 * 연산을못함 ex) 200 x 1.5 = 300
                .divide(servingSize,  // 300 ÷ 100
                        4 , // 소수점 아래 4자리까지 계산
                        RoundingMode.HALF_UP); // 5번째 자리에서 반올림 (일반 반올림)
    }

}
