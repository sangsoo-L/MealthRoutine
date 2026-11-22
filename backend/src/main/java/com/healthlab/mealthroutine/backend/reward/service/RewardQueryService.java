package com.healthlab.mealthroutine.backend.reward.service;

import com.healthlab.mealthroutine.backend.common.PageResponse;
import com.healthlab.mealthroutine.backend.reward.domain.LevelRule;
import com.healthlab.mealthroutine.backend.reward.domain.PointAccount;
import com.healthlab.mealthroutine.backend.reward.domain.UserProgress;
import com.healthlab.mealthroutine.backend.reward.dto.MyRewardResponse;
import com.healthlab.mealthroutine.backend.reward.dto.PointTransactionResponse;
import com.healthlab.mealthroutine.backend.reward.repository.LevelRuleRepository;
import com.healthlab.mealthroutine.backend.reward.repository.PointAccountRepository;
import com.healthlab.mealthroutine.backend.reward.repository.PointTransactionRepository;
import com.healthlab.mealthroutine.backend.reward.repository.UserProgressRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;


import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RewardQueryService {

    private final UserProgressRepository userProgressRepository;
    private final PointAccountRepository pointAccountRepository;
    private final LevelRuleRepository levelRuleRepository;
    private final PointTransactionRepository pointTransactionRepository;

    public MyRewardResponse getMy(Long userId){
        long totalXp = userProgressRepository.findById(userId).map(UserProgress::getTotalXp).orElse(0L); // 아직 없으면 0
        int level = userProgressRepository.findById(userId).map(UserProgress::getLevel).orElse(1); // 아직 없으면 1
        long balance = pointAccountRepository.findById(userId).map(PointAccount::getBalance).orElse(0L);

        List<LevelRule> levels = levelRuleRepository.findAllByOrderByRequiredTotalXpDesc();

        String name = levels.stream().filter(r -> r.getLevelNumber() == level)
                .map(LevelRule::getLevelName).findFirst().orElse(null); // 현재 레벨 이름

        Long next = levels.stream().map(LevelRule::getRequiredTotalXp)
                .filter(xp -> xp > totalXp).min(Long::compare).orElse(null); // 다음 기준

        return new MyRewardResponse(level,name,totalXp,next,balance);
    }

    public PageResponse<PointTransactionResponse> getPointHistory(Long userId, Pageable pageable){
        return PageResponse.from(pointTransactionRepository
                .findByUserIdOrderByPointTransactionIdDesc(userId,pageable)
                .map(PointTransactionResponse::from)); // 엔티티 → DTO
    }

}
