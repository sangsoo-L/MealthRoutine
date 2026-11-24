package com.healthlab.mealthroutine.backend.exercise.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseRoutineEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseRoutineItemEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.SessionStatus;
import com.healthlab.mealthroutine.backend.exercise.domain.SetTargetsJson;
import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutRecordType;
import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutSessionEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutSessionExerciseEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutSessionSetEntity;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * startedAt and endedAt are Korean time without an offset, as before. {@code requestId} is present only for sessions
 * uploaded as a completed record, and {@code created} only on that upload's response (false = repeat of the same
 * requestId).
 */
public record SessionResponse(Long workoutSessionId, Long routineId, LocalDateTime startedAt, LocalDateTime endedAt,
        SessionStatus status, Byte feedbackRating, String feedbackNote,
        @JsonInclude(JsonInclude.Include.NON_NULL) String requestId,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<Exercise> exercises,
        @JsonInclude(JsonInclude.Include.NON_NULL) Boolean created) {

    public static SessionResponse summary(WorkoutSessionEntity s) {
        return of(s, null, null);
    }

    public static SessionResponse detail(WorkoutSessionEntity s) {
        return detail(s, null);
    }

    public static SessionResponse detail(WorkoutSessionEntity s, Boolean created) {
        return of(s, s.getExercises().stream().map(Exercise::from).toList(), created);
    }

    private static SessionResponse of(WorkoutSessionEntity s, List<Exercise> exercises, Boolean created) {
        ExerciseRoutineEntity routine = s.getRoutine();
        return new SessionResponse(s.getWorkoutSessionId(), routine == null ? null : routine.getRoutineId(),
                s.getStartedAt(), s.getEndedAt(), s.getStatus(), s.getFeedbackRating(), s.getFeedbackNote(),
                s.getRequestId(), exercises, created);
    }

    /** {@code recordType} and {@code setTargets} are left out for exercises recorded the old way. */
    public record Exercise(Long workoutSessionExercisesId, Long exerciseId, String exerciseName,
            Long exerciseRoutineItemId, List<Set> sets,
            @JsonInclude(JsonInclude.Include.NON_NULL) WorkoutRecordType recordType,
            @JsonInclude(JsonInclude.Include.NON_NULL) List<SetTarget> setTargets) {

        static Exercise from(WorkoutSessionExerciseEntity e) {
            ExerciseRoutineItemEntity item = e.getRoutineItem();
            return new Exercise(e.getWorkoutSessionExercisesId(), e.getExercise().getExerciseId(),
                    e.getExercise().getName(), item == null ? null : item.getExerciseRoutineItemId(),
                    e.getSets().stream().map(Set::from).toList(), e.getRecordType(),
                    SetTargetsJson.read(e.getSetTargets()));
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
