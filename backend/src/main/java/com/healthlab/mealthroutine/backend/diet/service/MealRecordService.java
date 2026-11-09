package com.healthlab.mealthroutine.backend.diet.service;

import com.healthlab.mealthroutine.backend.diet.domain.*;
import com.healthlab.mealthroutine.backend.diet.dto.MealRecordCreateRequest;
import com.healthlab.mealthroutine.backend.diet.dto.MealRecordResponse;
import com.healthlab.mealthroutine.backend.diet.repository.FoodRepository;
import com.healthlab.mealthroutine.backend.diet.repository.MealRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

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

    // 날짜별 목록 (예: 11/9 하루치 실제 섭취 기록)
    public List<MealRecordResponse> getDaily(Long userId , LocalDate date, RecordType recordType){
        LocalDateTime start = date.atStartOfDay();
        LocalDateTime end =  date.plusDays(1).atStartOfDay();
        return mealRecordRepository
                .findDaily(userId,recordType, RecordStatus.DELETED,start,end)
                .stream()
                .map(MealRecordResponse::from)
                .toList();
    }


    // 상세 조회 (본인 기록만, 삭제된 건 제외)
    public MealRecordResponse get(Long userId,Long mealRecordId){
        return MealRecordResponse.from(findOwned(userId,mealRecordId));

    }

    @Transactional // 상태를 바꾸니까 쓰기 트랜잭션
    public void delete(Long userId,Long mealRecordId){
        findOwned(userId,mealRecordId).delete(); // 내 기록 확인 → 상태 변경 알아서저장함
    }

    // 내 기록인지 확인하면서 가져오기 (수정, 삭제에서도 재사용)
    private MealRecord findOwned(Long userId,Long mealRecordId){
        MealRecord record = mealRecordRepository.findById(mealRecordId)
                .filter(r -> r.getRecordStatus() != RecordStatus.DELETED) // 삭제된건 없는지
                .orElseThrow(() -> new IllegalArgumentException("식단 기록을 찾을 수 없습니다 . id=" + mealRecordId ));
        if (!record.getUserId().equals(userId)){
            throw new IllegalArgumentException("본인의 식단 기록만 조회할 수 있습니다.");
        }
        return record;
    }


}