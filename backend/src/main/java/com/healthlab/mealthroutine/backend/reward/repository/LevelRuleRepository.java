package com.healthlab.mealthroutine.backend.reward.repository;

import com.healthlab.mealthroutine.backend.reward.domain.LevelRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LevelRuleRepository extends JpaRepository<LevelRule , Long> {
    List<LevelRule> findAllByOrderByRequiredTotalXpDesc(); // 경험치 큰 순 (레벨 계산용)
}
