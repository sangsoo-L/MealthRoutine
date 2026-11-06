package com.healthlab.mealthroutine.backend.diet.repository;

import com.healthlab.mealthroutine.backend.diet.domain.MealRecord;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MealRecordRepository extends JpaRepository<MealRecord,Long> {
}
