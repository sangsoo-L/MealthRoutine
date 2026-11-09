package com.healthlab.mealthroutine.backend.exercise.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseRoutineEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseRoutineItemEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.SessionStatus;
import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutSessionEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutSessionExerciseEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutSessionSetEntity;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record SessionResponse(Long workoutSessionId, Long routineId, LocalDateTime startedAt, LocalDateTime endedAt,
        SessionStatus status, Byte feedbackRating, String feedbackNote,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<Exercise> exercises) {

    public static SessionResponse summary(WorkoutSessionEntity s) {
        return of(s, null);
    }

    public static SessionResponse detail(WorkoutSessionEntity s) {
        return of(s, s.getExercises().stream().map(Exercise::from).toList());
    }

    private static SessionResponse of(WorkoutSessionEntity s, List<Exercise> exercises) {
        ExerciseRoutineEntity routine = s.getRoutine();
        return new SessionResponse(s.getWorkoutSessionId(), routine == null ? null : routine.getRoutineId(),
                s.getStartedAt(), s.getEndedAt(), s.getStatus(), s.getFeedbackRating(), s.getFeedbackNote(), exercises);
    }

    public record Exercise(Long workoutSessionExercisesId, Long exerciseId, String exerciseName,
            Long exerciseRoutineItemId, List<Set> sets) {

        static Exercise from(WorkoutSessionExerciseEntity e) {
            ExerciseRoutineItemEntity item = e.getRoutineItem();
            return new Exercise(e.getWorkoutSessionExercisesId(), e.getExercise().getExerciseId(),
                    e.getExercise().getName(), item == null ? null : item.getExerciseRoutineItemId(),
                    e.getSets().stream().map(Set::from).toList());
        }
    }

    public record Set(Short setNumber, Short reps, BigDecimal weightKg, Integer durationSeconds, BigDecimal distanceM,
            Integer restSeconds) {

        static Set from(WorkoutSessionSetEntity s) {
            return new Set(s.getSetNumber(), s.getReps(), s.getWeightKg(), s.getDurationSeconds(), s.getDistanceM(),
                    s.getRestSeconds());
        }
    }
}
