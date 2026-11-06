package com.healthlab.mealthroutine.backend.diet.service;

import com.healthlab.mealthroutine.backend.diet.domain.Food;
import com.healthlab.mealthroutine.backend.diet.domain.MealRecord;
import com.healthlab.mealthroutine.backend.diet.domain.MealRecordItem;
import com.healthlab.mealthroutine.backend.diet.dto.MealRecordCreateRequest;
import com.healthlab.mealthroutine.backend.diet.dto.MealRecordResponse;
import com.healthlab.mealthroutine.backend.diet.repository.FoodRepository;
import com.healthlab.mealthroutine.backend.diet.repository.MealRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MealRecordService {

    private final MealRecordRepository mealRecordRepository;
    private final FoodRepository foodRepository;

    @Transactional
    public MealRecordResponse create(Long userId, MealRecordCreateRequest req) {
        MealRecord record = MealRecord.create(userId, req.mealAt(), req.mealType(), req.recordType(), req.notes()); // 1. 끼니 만들기
        for (MealRecordCreateRequest.Item item : req.items()) { // 2. 음식마다
            Food food = foodRepository.findById(item.foodId())
                    .orElseThrow(() -> new IllegalArgumentException("음식을 찾을 수 없습니다 . id = " + item.foodId()));
            record.addItem(MealRecordItem.of(food, item.quantity()));// 영양소 계산 + 연결
        }
        record.recalculateTotals(); // 3. 끼니 합계 계산
        MealRecord saved = mealRecordRepository.save(record); // 4. 저장 (아이템도 cascade로 같이)
        return MealRecordResponse.from(saved); // 5. DTO로 바꿔서 반환
    }
}