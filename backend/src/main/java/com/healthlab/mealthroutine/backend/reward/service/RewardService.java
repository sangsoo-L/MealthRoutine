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

    public void grant(Long userId , String ruleCode , String key){
        RewardRule rule = rewardRuleRepository.findByRuleCodeAndIsActiveTrue(ruleCode).orElse(null);
        if (rule == null) return; // 1. 없거나 꺼진 규칙 → 안 줌
        if (experienceTransactionRepository.existsByExpIdempotencyKey(key)) return; // 2. 이미 준 보상 → 안 줌

        int xp = rule.getXpAmount();
        int points = rule.getPointsAmount();

        experienceTransactionRepository.save(ExperienceTransaction.of(userId,xp,ruleCode,key)); // 3. 경험치 내역
        if (points >0){  // 퀴즈 참여처럼 0포인트면 내역 안 남김
            pointTransactionRepository.save(PointTransaction.earn(userId,points,ruleCode,key));
        }

        UserProgress progress = userProgressRepository.findById(userId) // 처음이면 레벨 1로 생성
                .orElseGet(() -> userProgressRepository.save(UserProgress.create(userId)));
        progress.addXp(xp, calculateLevel(progress.getTotalXp() + xp)); // 더한 뒤 경험치로 레벨 계산

        PointAccount account = pointAccountRepository.findById(userId) // 처음이면 잔액 0으로 생성
                .orElseGet(() -> pointAccountRepository.save(PointAccount.create(userId)));
        account.earn(points);
        // progress, account는 save 안 해도 됨 -> 더티 체킹으로 자동 update
    }

    private int calculateLevel(long totalXp){
        return levelRuleRepository.findAllByOrderByRequiredTotalXpDesc().stream()  // 4500, 3600, ... 0 순서
                .filter(r -> totalXp >= r.getRequiredTotalXp()) // 넘은 기준 중
                .findFirst()  // 가장 높은 것
                .map(LevelRule::getLevelNumber)
                .orElse(1);
    }

}
