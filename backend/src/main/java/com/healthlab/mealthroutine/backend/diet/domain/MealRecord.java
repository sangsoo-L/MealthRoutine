package com.healthlab.mealthroutine.backend.diet.domain;

import com.healthlab.mealthroutine.backend.global.entity.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.util.Objects;
import java.util.function.Function;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "meal_records")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MealRecord extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long mealRecordId;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false)
    private LocalDateTime mealAt;

    @Enumerated(EnumType.STRING) // DB에 "LUNCH" 문자열로 저장
    @Column(nullable = false , length = 20)
    private MealType mealType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false , length = 20)
    private RecordType recordType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false , length = 20)
    private RecordStatus recordStatus;

    @Column(precision = 9 , scale = 2)
    private BigDecimal totalCaloriesKcal;

    @Column(name = "total_carbohydrate_g" ,precision = 8 , scale = 2)
    private BigDecimal totalCarbohydrateG;

    @Column(name = "total_protein_g",precision = 8, scale = 2)
    private BigDecimal totalProteinG;

    @Column(name = "total_fat_g",precision = 8, scale = 2)
    private BigDecimal totalFatG;

    @Column(name = "total_sugar_g",precision = 8, scale = 2)
    private BigDecimal totalSugarG;

    @Column(precision = 8, scale = 2)
    private BigDecimal totalSodiumMg;

    @Column(length = 1000)
    private String notes;
    @OrderBy("mealItemId ASC")
    @OneToMany(mappedBy = "mealRecord", // MealRecordItem의 mealRecord 필드가 FK 주인
                cascade = CascadeType.ALL,   // 끼니 저장 시 아이템도 같이 저장
                orphanRemoval = true)  // 목록에서 빠진 아이템은 DB에서도 삭제
    private List<MealRecordItem> items = new ArrayList<>();

    // 끼니 생성하는곳
    public static MealRecord create(Long userId, LocalDateTime mealAt , MealType mealType , RecordType recordType, String notes){
        MealRecord record = new MealRecord();
        record.userId = userId;
        record.mealAt = mealAt;
        record.mealType = mealType;
                                              //프론트가 보낸 값 (PLAN 또는 ACTUAL) or 기본값 actual
        record.recordType = (recordType != null) ? recordType : RecordType.ACTUAL; // 안 보내면 실제 섭취
        record.recordStatus = RecordStatus.CONFIRMED;
        record.notes = notes;
        return record;
    }

    // 음식 한 줄 추가 + 양방향 연결
    public void addItem(MealRecordItem item){
        items.add(item); // 끼니 -> 아이템
        item.assignTo(this);
    }

    // 아이템들의 영양소를 더해서 합계 저장
    public void recalculateTotals(){
        totalCaloriesKcal = sum(MealRecordItem::getCaloriesKcal);
        totalCarbohydrateG = sum(MealRecordItem::getCarbohydrateG);
        totalProteinG = sum(MealRecordItem::getProteinG);
        totalFatG = sum(MealRecordItem::getFatG);
        totalSugarG = sum(MealRecordItem::getSugarG);
        totalSodiumMg = sum(MealRecordItem::getSodiumMg);
    }

    private BigDecimal sum(Function<MealRecordItem,BigDecimal> getter){
        return items.stream()
                .map(getter)  // 각 아이템에서 해당 영양소 꺼내기
                .filter(Objects::nonNull) // 값 없는 건 제외
                .reduce(BigDecimal.ZERO,BigDecimal::add);  // 0부터 차례로 더하기
    }
    // 소프트 삭제: 행은 남기고 상태만 DELETED로
    public void delete(){
        this.recordStatus = RecordStatus.DELETED;
    }
}
