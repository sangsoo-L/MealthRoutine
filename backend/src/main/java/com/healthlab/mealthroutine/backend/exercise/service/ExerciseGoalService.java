package com.healthlab.mealthroutine.backend.exercise.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseGoalEntity;
import com.healthlab.mealthroutine.backend.exercise.dto.GoalCreateRequest;
import com.healthlab.mealthroutine.backend.exercise.dto.GoalResponse;
import com.healthlab.mealthroutine.backend.exercise.dto.GoalUpdateRequest;
import com.healthlab.mealthroutine.backend.exercise.repository.ExerciseGoalRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ExerciseGoalService {

    private final ExerciseGoalRepository goalRepository;

    @Transactional
    public GoalResponse create(Long userId, GoalCreateRequest request) {
        ExerciseGoalEntity goal = new ExerciseGoalEntity();
        goal.setUserId(userId);
        goal.setGoalName(request.goalName());
        goal.setTargetValue(request.targetValue());
        goal.setStartDate(request.startDate());
        goal.setEndDate(request.endDate());
        goal.setExerciseMin(request.exerciseMin());
        goal.setPreferenceExerciseEquipment(request.preferenceExerciseEquipment());
        checkDates(goal);
        return GoalResponse.from(goalRepository.save(goal));
    }

    public List<GoalResponse> getAll(Long userId) {
        return goalRepository.findByUserIdOrderByExerciseGoalIdDesc(userId).stream().map(GoalResponse::from).toList();
    }

    @Transactional
    public GoalResponse update(Long userId, Long goalId, GoalUpdateRequest request) {
        ExerciseGoalEntity goal = goalRepository.findById(goalId)
                .orElseThrow(() -> new BusinessException(ErrorCode.EXERCISE_GOAL_NOT_FOUND));
        if (!userId.equals(goal.getUserId())) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        if (request.goalName() != null) {
            goal.setGoalName(request.goalName());
        }
        if (request.targetValue() != null) {
            goal.setTargetValue(request.targetValue());
        }
        if (request.startDate() != null) {
            goal.setStartDate(request.startDate());
        }
        if (request.endDate() != null) {
            goal.setEndDate(request.endDate());
        }
        if (request.exerciseMin() != null) {
            goal.setExerciseMin(request.exerciseMin());
        }
        if (request.status() != null) {
            goal.setStatus(request.status());
        }
        if (request.preferenceExerciseEquipment() != null) {
            goal.setPreferenceExerciseEquipment(request.preferenceExerciseEquipment());
        }
        checkDates(goal);
        return GoalResponse.from(goal);
    }

    private void checkDates(ExerciseGoalEntity goal) {
        if (goal.getEndDate() != null && goal.getEndDate().isBefore(goal.getStartDate())) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }
}
