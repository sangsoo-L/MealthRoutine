package com.healthlab.mealthroutine.backend.exercise.repository;

import com.healthlab.mealthroutine.backend.exercise.domain.SessionStatus;
import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutSessionEntity;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WorkoutSessionRepository extends JpaRepository<WorkoutSessionEntity, Long> {

    @Query("""
            select s from WorkoutSessionEntity s
            where s.userId = :userId
              and (:status is null or s.status = :status)
              and (:from is null or s.startedAt >= :from)
              and (:to is null or s.startedAt < :to)
            order by s.startedAt desc, s.workoutSessionId desc
            """)
    Page<WorkoutSessionEntity> search(@Param("userId") Long userId, @Param("status") SessionStatus status,
            @Param("from") LocalDateTime from, @Param("to") LocalDateTime to, Pageable pageable);

    @Query(nativeQuery = true, value = """
            select count(*) as sessionCount,
                   coalesce(sum(timestampdiff(second, started_at, ended_at)), 0) as totalDurationSeconds
            from workout_sessions
            where user_id = :userId and status = 'completed' and started_at >= :from and started_at < :to
            """)
    SessionTotals sumSessions(@Param("userId") Long userId, @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    @Query(nativeQuery = true, value = """
            select coalesce(sum(st.weight_kg * st.reps), 0)
            from workout_sessions s
            join workout_session_exercises e on e.workout_session_id = s.workout_session_id
            join workout_session_sets st on st.workout_session_exercises_id = e.workout_session_exercises_id
            where s.user_id = :userId and s.status = 'completed' and s.started_at >= :from and s.started_at < :to
            """)
    BigDecimal sumVolumeKg(@Param("userId") Long userId, @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    interface SessionTotals {
        long getSessionCount();

        long getTotalDurationSeconds();
    }
}
