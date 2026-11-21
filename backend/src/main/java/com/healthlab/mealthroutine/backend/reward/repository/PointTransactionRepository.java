package com.healthlab.mealthroutine.backend.reward.repository;

import com.healthlab.mealthroutine.backend.reward.domain.PointTransaction;
import com.healthlab.mealthroutine.backend.reward.domain.PointTransactionType;
import org.springframework.data.domain.Page;
import org.springframework.data.jpa.repository.JpaRepository;

import org.springframework.data.domain.Pageable;

public interface PointTransactionRepository extends JpaRepository<PointTransaction,Long> {
    Page<PointTransaction> findByUserIdOrderByPointTransactionIdDesc(Long userId, Pageable pageable); // 내역 조회 (최신순)
}
