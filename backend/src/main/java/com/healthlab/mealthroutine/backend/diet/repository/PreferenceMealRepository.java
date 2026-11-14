package com.healthlab.mealthroutine.backend.diet.repository;

import com.healthlab.mealthroutine.backend.diet.domain.Food;
import com.healthlab.mealthroutine.backend.diet.domain.PreferenceMeal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PreferenceMealRepository extends JpaRepository<PreferenceMeal,Long> {

    @Query("""
            SELECT p.food From PreferenceMeal p
            WHERE  p.userId = :userId
            ORDER BY p.preferenceMealId DESC
           """)
    List<Food> findFavorFoods(@Param("userId") Long userId); // 찜한 음식 목록 (최근 순)

    boolean existsByUserIdAndFoodFoodId(Long userId , Long foodId); // 이미 찜했는지

    void deleteByUserIdAndFoodFoodId(Long userId,Long foodId); // 찜 해제

}
