package com.healthlab.mealthroutine.backend.exercise.repository;

import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.PreferenceExerciseEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PreferenceExerciseRepository extends JpaRepository<PreferenceExerciseEntity, Long> {

    @Query("""
            select p.exercise from PreferenceExerciseEntity p
            where p.userId = :userId
            order by p.preferenceExercisesId desc
            """)
    List<ExerciseEntity> findFavoriteExercises(@Param("userId") Long userId);

    boolean existsByUserIdAndExerciseExerciseId(Long userId, Long exerciseId);

    void deleteByUserIdAndExerciseExerciseId(Long userId, Long exerciseId);
}
