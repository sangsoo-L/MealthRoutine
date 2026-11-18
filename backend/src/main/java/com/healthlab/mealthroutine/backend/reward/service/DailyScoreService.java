package com.healthlab.mealthroutine.backend.reward.service;

import com.healthlab.mealthroutine.backend.diet.domain.DietGoal;
import com.healthlab.mealthroutine.backend.diet.domain.MealRecord;
import com.healthlab.mealthroutine.backend.diet.domain.RecordStatus;
import com.healthlab.mealthroutine.backend.diet.domain.RecordType;
import com.healthlab.mealthroutine.backend.diet.repository.DietGoalRepository;
import com.healthlab.mealthroutine.backend.diet.repository.MealRecordRepository;
import com.healthlab.mealthroutine.backend.exercise.domain.GoalStatus;
import com.healthlab.mealthroutine.backend.reward.repository.AttendanceRepository;
import com.healthlab.mealthroutine.backend.reward.repository.RewardRuleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.function.Function;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DailyScoreService {

    private final MealRecordRepository mealRecordRepository;
    private final DietGoalRepository dietGoalRepository;
    private final AttendanceRepository attendanceRepository;
    private final DietScoreCalculator calculator;
    private final RewardService rewardService;
    private final WorkoutCheck workoutCheck;

    public record DailyScore(int dietScore , int missionScore , int total){}

    public DailyScore calculate(Long userId , LocalDate date){ // 그날 점수 (실시간 조회용)
        int diet = dietScore(userId,date);
        int mission = missionScore(userId,date);
        return new DailyScore(diet, mission, diet + mission);
    }
    
    private int dietScore(Long userId , LocalDate date){ // 식단 60점
        DietGoal goal = dietGoalRepository.findByUserIdAndStatus(userId, GoalStatus.ACTIVE)
                .stream().findFirst().orElse(null);
        if (goal == null) return 0; // 목표가 없으면 0점
        List<MealRecord> records = mealRecordRepository.findDaily(userId, RecordType.ACTUAL,
                RecordStatus.DELETED, date.atStartOfDay(),date.plusDays(1).atStartOfDay());
        if(records.isEmpty()) return 0; // 기록 없으면 0점

        return calculator.calories(sum(records,MealRecord::getTotalCaloriesKcal), num(goal.getTargetCaloriesKcal()))
                + calculator.macro(sum(records,MealRecord::getTotalCarbohydrateG), num(goal.getTargetCarbohydrateG()))
                + calculator.macro(sum(records,MealRecord::getTotalProteinG), num(goal.getTargetProteinG()))
                + calculator.macro(sum(records,MealRecord::getTotalFatG), num(goal.getTargetFatG()));
    }

    private int missionScore(Long userId,LocalDate date) { // 미션 40점

        int score = 0;

        if(workoutCheck.hasCompletedWorkout(userId,date)) score += 20;
        if(attendanceRepository.existsByUserIdAndAttendDate(userId,date)) score += 10;
        // TODO 오늘의 퀴즈 10점(오답 5점) : 퀴즈기능 들어갈부분
        return score;
    }

    @Transactional // 보상 지급은 쓰기
    public void settle(Long userId, LocalDate date){ // 하루 점수 확정 + 보상
        int total = calculate(userId,date).total();
        if (total <= 0 )return;
        // TODO 보상 비율 확정 필요 (지금 -> 경험치 = 점수 , 포인트 = 점수/2 이런식으로 계산중)
        rewardService.grantAmount(userId,"DAILY_SCORE",total,total/2
                ,"DAILY_SCORE:" + userId + ":" + date);
    }

    private double sum(List<MealRecord> records, Function<MealRecord, BigDecimal> getter){ // 그날 합계
        return records.stream().map(getter).filter(Objects::nonNull)
                .mapToDouble(BigDecimal::doubleValue).sum();
    }

    private double num(BigDecimal v) {return v == null ? 0 : v.doubleValue();} // 목표값 없으면 0

}
