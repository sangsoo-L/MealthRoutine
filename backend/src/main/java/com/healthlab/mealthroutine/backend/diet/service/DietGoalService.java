package com.healthlab.mealthroutine.backend.diet.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.diet.domain.DietGoal;
import com.healthlab.mealthroutine.backend.diet.dto.DietGoalCreateRequest;
import com.healthlab.mealthroutine.backend.diet.dto.DietGoalResponse;
import com.healthlab.mealthroutine.backend.diet.dto.DietGoalUpdateRequest;
import com.healthlab.mealthroutine.backend.diet.repository.DietGoalRepository;
import com.healthlab.mealthroutine.backend.exercise.domain.GoalStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DietGoalService {

    private final DietGoalRepository dietGoalRepository;

    // 새 목표 만들기: 기존 진행 중 목표는 완료 처리 -> 진행 중 목표는 항상 1개
    @Transactional
    public DietGoalResponse create(Long userId, DietGoalCreateRequest req){
        dietGoalRepository.findByUserIdAndStatus(userId, GoalStatus.ACTIVE)
                .forEach(DietGoal::complete);
        DietGoal goal = DietGoal.create(userId,
                req.targetCaloriesKcal(),req.targetWeightKg(),
                req.targetProteinG(),req.targetCarbohydrateG(),req.targetFatG(),
                req.targetSugarG(),req.targetSodiumMg(),
                req.startDate(),req.endDate());
        return DietGoalResponse.from(dietGoalRepository.save(goal));
    }

    // 진행 중 목표 조회 (없으면 null -> 프론트에서 "목표 설정하기" 안내)
    public DietGoalResponse getActive(Long userId){
        return dietGoalRepository.findByUserIdAndStatus(userId,GoalStatus.ACTIVE).stream()
                .findFirst()
                .map(DietGoalResponse::from)
                .orElse(null);
    }

    // 목표 수정 (본인 목표만)
    @Transactional
    public DietGoalResponse update(Long userId, Long dietGoalId, DietGoalUpdateRequest req){
        DietGoal goal = dietGoalRepository.findById(dietGoalId)
                .filter(g -> g.getUserId().equals(userId)) // 남의 목표는 없는 것처럼
                .orElseThrow(() -> new BusinessException(ErrorCode.DIET_GOAL_NOT_FOUND));
        goal.update(req.targetCaloriesKcal(),req.targetWeightKg(),
                req.targetProteinG(),req.targetCarbohydrateG(),req.targetFatG(),
                req.targetSugarG(),req.targetSodiumMg(),
                req.endDate(),req.status());
        return DietGoalResponse.from(goal);// 변경 감지로 자동 UPDATE
    }
}
