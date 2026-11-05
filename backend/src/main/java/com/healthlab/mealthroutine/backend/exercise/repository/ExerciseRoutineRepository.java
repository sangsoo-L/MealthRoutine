package com.healthlab.mealthroutine.backend.exercise.repository;

import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseRoutineEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ExerciseRoutineRepository extends JpaRepository<ExerciseRoutineEntity, Long> {

    @Query("""
            select r from ExerciseRoutineEntity r
            where r.visibility = com.healthlab.mealthroutine.backend.exercise.domain.RoutineVisibility.PUBLIC
               or r.ownerUserId = :userId
            order by r.routineId desc
            """)
    Page<ExerciseRoutineEntity> findVisible(@Param("userId") Long userId, Pageable pageable);
}
