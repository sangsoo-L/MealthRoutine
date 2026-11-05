package com.healthlab.mealthroutine.backend.diet.repository;

import com.healthlab.mealthroutine.backend.diet.domain.Food;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
                                            //<엔티티, PK 타입>
public interface FoodRepositoty extends JpaRepository<Food,Long> {

    Page<Food> findByNameContaining(String keyword, Pageable pageable); // 메서드 이름만으로 쿼리 자동 생성

}
