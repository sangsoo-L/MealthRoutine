package com.healthlab.mealthroutine.backend.diet.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.diet.dto.FoodResponse;
import com.healthlab.mealthroutine.backend.diet.repository.FoodRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true) // 조회만 하니까 읽기 전용(변경 감지 생략)
public class FoodService {

    private final FoodRepository foodRepository;

    public Page<FoodResponse> search(String keyword, Pageable pageable){
        return foodRepository.findByNameContaining(keyword,pageable)
                             .map(FoodResponse::from); // Food -> FoodResponse
    }

    public FoodResponse get(Long foodId){
        return foodRepository.findById(foodId)
                .map(FoodResponse::from)// 있으면 dto 로바꾸는거
                .orElseThrow(() -> new BusinessException(ErrorCode.FOOD_NOT_FOUND));
    }
}
