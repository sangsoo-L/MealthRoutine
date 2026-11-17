package com.healthlab.mealthroutine.backend.reward.repository;

import com.healthlab.mealthroutine.backend.reward.domain.UserProgress;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserProgressRepository extends JpaRepository<UserProgress,Long> { // PK가 userId라 findById로 충분
}
