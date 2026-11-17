package com.healthlab.mealthroutine.backend.diet.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.diet.domain.Food;
import com.healthlab.mealthroutine.backend.diet.domain.PreferenceMeal;
import com.healthlab.mealthroutine.backend.diet.dto.FoodResponse;
import com.healthlab.mealthroutine.backend.diet.repository.FoodRepository;
import com.healthlab.mealthroutine.backend.diet.repository.PreferenceMealRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true) // 조회만 하니까 읽기 전용(변경 감지 생략)
public class FoodService {
    private final PreferenceMealRepository preferenceMealRepository;
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

    // 내 즐겨찾기 목록
    public List<FoodResponse> getFavorites(Long userId){
        return preferenceMealRepository.findFavorFoods(userId).stream()
                .map(FoodResponse::from)
                .toList();
    }

    // 즐겨찾기 등록(이미있으면 아무것도안함)
    @Transactional
    public void addFavorite(Long userId, Long foodId){
        Food food = foodRepository.findById(foodId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FOOD_NOT_FOUND));
        if(!preferenceMealRepository.existsByUserIdAndFoodFoodId(userId, foodId)){
            preferenceMealRepository.save(new PreferenceMeal(userId,food));
        }
    }

    @Transactional
    public void removeFavorite(Long userId, Long foodId){
        preferenceMealRepository.deleteByUserIdAndFoodFoodId(userId,foodId);
    }

}
