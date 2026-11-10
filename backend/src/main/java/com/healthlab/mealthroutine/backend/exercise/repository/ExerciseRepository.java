package com.healthlab.mealthroutine.backend.exercise.repository;

import com.healthlab.mealthroutine.backend.exercise.domain.Difficulty;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ExerciseRepository extends JpaRepository<ExerciseEntity, Long> {

    @Query("""
            select e from ExerciseEntity e
            where (:keyword is null or e.name like concat('%', :keyword, '%'))
              and (:difficulty is null or e.difficulty = :difficulty)
              and (:exerciseType is null or e.exerciseType = :exerciseType)
              and (:equipment is null or e.exerciseEquipment = :equipment)
            order by e.exerciseId
            """)
    Page<ExerciseEntity> search(@Param("keyword") String keyword, @Param("difficulty") Difficulty difficulty,
            @Param("exerciseType") String exerciseType, @Param("equipment") String equipment, Pageable pageable);
}
