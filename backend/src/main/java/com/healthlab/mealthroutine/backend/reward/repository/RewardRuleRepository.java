package com.healthlab.mealthroutine.backend.reward.repository;

import com.healthlab.mealthroutine.backend.reward.domain.RewardRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RewardRuleRepository extends JpaRepository<RewardRule, Long> {
    Optional<RewardRule> findByRuleCodeAndIsActiveTrue(String ruleCode); // 켜져있는규칙
}
