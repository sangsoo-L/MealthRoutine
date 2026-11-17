package com.healthlab.mealthroutine.backend.reward.repository;

import com.healthlab.mealthroutine.backend.reward.domain.ExperienceTransaction;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExperienceTransactionRepository extends JpaRepository<ExperienceTransaction , Long> {
    boolean existsByExpIdempotencyKey(String key);  // 이미 준 보상인지 확인
}
