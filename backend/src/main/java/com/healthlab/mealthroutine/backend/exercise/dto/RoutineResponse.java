package com.healthlab.mealthroutine.backend.exercise.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.healthlab.mealthroutine.backend.exercise.domain.Difficulty;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseRoutineEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseRoutineItemEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.RoutineVisibility;
import com.healthlab.mealthroutine.backend.exercise.domain.SetTargetsJson;
import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutRecordType;
import java.time.LocalDateTime;
import java.util.List;

/**
 * {@code created} is only on the create response: true when this request made the routine, false when it is a repeat
 * of an earlier request with the same requestId. The frontend's apiRequest returns only data, not the HTTP status,
 * so the flag has to be in the body.
 */
public record RoutineResponse(Long routineId, Long ownerUserId, String routineName, String description,
        Difficulty difficulty, RoutineVisibility visibility, int revision,
        @JsonInclude(JsonInclude.Include.NON_NULL) String requestId,
        LocalDateTime createdAt, LocalDateTime updatedAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<Item> items,
        @JsonInclude(JsonInclude.Include.NON_NULL) Boolean created) {

    public static RoutineResponse summary(ExerciseRoutineEntity r) {
        return of(r, null, null);
    }

    public static RoutineResponse detail(ExerciseRoutineEntity r) {
        return detail(r, null);
    }

    public static RoutineResponse detail(ExerciseRoutineEntity r, Boolean created) {
        return of(r, r.getItems().stream().map(Item::from).toList(), created);
    }

    private static RoutineResponse of(ExerciseRoutineEntity r, List<Item> items, Boolean created) {
        return new RoutineResponse(r.getRoutineId(), r.getOwnerUserId(), r.getRoutineName(), r.getDescription(),
                r.getDifficulty(), r.getVisibility(), r.getRevision(), r.getRequestId(), r.getCreatedAt(),
                r.getUpdatedAt(), items, created);
    }

    /** {@code recordType} and {@code sets} are left out for items saved the old way (targetSets only). */
    public record Item(Long exerciseRoutineItemId, Long exerciseId, String exerciseName, Short sequenceNumber,
            Short targetSets, Short targetReps, Integer targetDurationSeconds, Integer restSeconds,
            @JsonInclude(JsonInclude.Include.NON_NULL) WorkoutRecordType recordType,
            @JsonInclude(JsonInclude.Include.NON_NULL) List<SetTarget> sets) {

        static Item from(ExerciseRoutineItemEntity i) {
            return new Item(i.getExerciseRoutineItemId(), i.getExercise().getExerciseId(), i.getExercise().getName(),
                    i.getSequenceNumber(), i.getTargetSets(), i.getTargetReps(), i.getTargetDurationSeconds(),
                    i.getRestSeconds(), i.getRecordType(), SetTargetsJson.read(i.getSetTargets()));
        }
    }
}
