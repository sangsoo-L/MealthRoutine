package com.healthlab.mealthroutine.backend.reward.service;

import com.healthlab.mealthroutine.backend.reward.domain.*;
import com.healthlab.mealthroutine.backend.reward.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class RewardService {
    private final RewardRuleRepository rewardRuleRepository;
    private final LevelRuleRepository levelRuleRepository;
    private final UserProgressRepository userProgressRepository;
    private final PointAccountRepository pointAccountRepository;
    private final ExperienceTransactionRepository experienceTransactionRepository;
    private final PointTransactionRepository pointTransactionRepository;

    public void grant(Long userId , String ruleCode , String key){  // 규칙 테이블 보고 고정량 지급
        RewardRule rule = rewardRuleRepository.findByRuleCodeAndIsActiveTrue(ruleCode).orElse(null);
        if (rule == null) return; // 1. 없거나 꺼진 규칙 → 안 줌
        grantAmount(userId,ruleCode,rule.getXpAmount(),rule.getPointsAmount(),key);
    }

    public void grantAmount(Long userId , String sourceType , int xp , int points, String key){
        if (experienceTransactionRepository.existsByExpIdempotencyKey(key)) return; // 이미 준 보상 → 안 줌

        experienceTransactionRepository.save(ExperienceTransaction.of(userId, xp, sourceType, key));
        if (points > 0) {
            pointTransactionRepository.save(PointTransaction.earn(userId, points, sourceType, key));
        }

        UserProgress progress = userProgressRepository.findById(userId)
                .orElseGet(() -> userProgressRepository.save(UserProgress.create(userId)));
        progress.addXp(xp, calculateLevel(progress.getTotalXp() + xp));

        PointAccount account = pointAccountRepository.findById(userId)
                .orElseGet(() -> pointAccountRepository.save(PointAccount.create(userId)));
        account.earn(points);
    }

    private int calculateLevel(long totalXp){
        return levelRuleRepository.findAllByOrderByRequiredTotalXpDesc().stream()  // 4500, 3600, ... 0 순서
                .filter(r -> totalXp >= r.getRequiredTotalXp()) // 넘은 기준 중
                .findFirst()  // 가장 높은 것
                .map(LevelRule::getLevelNumber)
                .orElse(1);
    }

}
