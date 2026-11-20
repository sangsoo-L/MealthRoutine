package com.healthlab.mealthroutine.backend.diet.domain;

import com.healthlab.mealthroutine.backend.exercise.domain.GoalStatus;
import com.healthlab.mealthroutine.backend.global.entity.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "diet_goals")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DietGoal extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long dietGoalId;

    @Column(nullable = false)
    private Long userId;

    @Column(precision = 8, scale = 2) private BigDecimal targetCaloriesKcal;
    @Column(precision = 5, scale = 2) private BigDecimal targetWeightKg;
    @Column(name = "target_protein_g",      precision = 8, scale = 2) private BigDecimal targetProteinG;
    @Column(name = "target_carbohydrate_g", precision = 8, scale = 2) private BigDecimal targetCarbohydrateG;
    @Column(name = "target_fat_g",          precision = 8, scale = 2) private BigDecimal targetFatG;
    @Column(name = "target_sugar_g",        precision = 8, scale = 2) private BigDecimal targetSugarG;
    @Column(precision = 8, scale = 2) private BigDecimal targetSodiumMg;

    @Column(nullable = false)
    private LocalDate startDate;
    private LocalDate endDate;

    @Column(nullable = false)
    private GoalStatus status;  // 변환기가 자동 적용돼서 @Enumerated 필요 없음

    // 목표 생성 ( 시작일 안 보내면 오늘 , 상태는 진행 중)
    public static DietGoal create(Long userId,                 // 누구의 목표인지
                                  BigDecimal targetCaloriesKcal, // 하루 목표 칼로리
                                  BigDecimal targetWeightKg,     // 목표 체중
                                  BigDecimal targetProteinG,     // 목표 단백질
                                  BigDecimal targetCarbohydrateG,// 목표 탄수화물
                                  BigDecimal targetFatG,         // 목표 지방
                                  BigDecimal targetSugarG,       // 목표 당류
                                  BigDecimal targetSodiumMg,     // 목표 나트륨
                                  LocalDate startDate,           // 시작일
                                  LocalDate endDate) {           // 종료일
        DietGoal goal = new DietGoal();                          // 빈 객체 만들기 (생성자는 막아둠)
        goal.userId = userId;
        goal.applyTargets(targetCaloriesKcal, targetWeightKg, targetProteinG,
                targetCarbohydrateG, targetFatG, targetSugarG, targetSodiumMg);                                  // 목표 수치 7개를 한 번에 채우기
        goal.startDate = (startDate != null) ? startDate : LocalDate.now(); // 없으면 오늘부터
        goal.endDate = endDate;                                  // 없으면 기한 없음(null)
        goal.status = GoalStatus.ACTIVE;                         // 새 목표는 항상 "진행 중"
        return goal;
    }

    // 보낸 값만 수정
    public void update(BigDecimal targetCaloriesKcal, BigDecimal targetWeightKg,
                       BigDecimal targetProteinG, BigDecimal targetCarbohydrateG,
                       BigDecimal targetFatG, BigDecimal targetSugarG, BigDecimal targetSodiumMg,
                       LocalDate endDate, GoalStatus status){
        if (targetCaloriesKcal != null) this.targetCaloriesKcal = targetCaloriesKcal;
        if (targetWeightKg != null) this.targetWeightKg = targetWeightKg;
        if (targetProteinG != null) this.targetProteinG = targetProteinG;
        if (targetCarbohydrateG != null) this.targetCarbohydrateG = targetCarbohydrateG;
        if (targetFatG != null) this.targetFatG = targetFatG;
        if (targetSugarG != null) this.targetSugarG = targetSugarG;
        if (targetSodiumMg != null) this.targetSodiumMg = targetSodiumMg;
        if (endDate != null) this.endDate = endDate;
        if (status != null) this.status = status;
    }

    // 새 목표가 생기면 기존 목표를 완료 처리
    public void complete(){
        this.status = GoalStatus.COMPLETED;
    }

    private void applyTargets(BigDecimal kcal, BigDecimal weight, BigDecimal protein,
                              BigDecimal carb, BigDecimal fat, BigDecimal sugar, BigDecimal sodium){
        this.targetCaloriesKcal = kcal;
        this.targetWeightKg = weight;
        this.targetProteinG = protein;
        this.targetCarbohydrateG = carb;
        this.targetFatG = fat;
        this.targetSugarG = sugar;
        this.targetSodiumMg = sodium;
    }

}
