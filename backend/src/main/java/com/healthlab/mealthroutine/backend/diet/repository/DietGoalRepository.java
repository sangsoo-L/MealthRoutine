package com.healthlab.mealthroutine.backend.diet.repository;

import com.healthlab.mealthroutine.backend.diet.domain.DietGoal;
import com.healthlab.mealthroutine.backend.exercise.domain.GoalStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DietGoalRepository extends JpaRepository<DietGoal,Long> {
    // 이 회원의 특정 상태 목표들(진행 중인 목표 찾기용)
    List<DietGoal> findByUserIdAndStatus(Long userId, GoalStatus status);
}
