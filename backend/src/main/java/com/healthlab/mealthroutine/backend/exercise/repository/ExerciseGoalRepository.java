package com.healthlab.mealthroutine.backend.exercise.repository;

import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseGoalEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExerciseGoalRepository extends JpaRepository<ExerciseGoalEntity, Long> {

    List<ExerciseGoalEntity> findByUserIdOrderByExerciseGoalIdDesc(Long userId);
}
