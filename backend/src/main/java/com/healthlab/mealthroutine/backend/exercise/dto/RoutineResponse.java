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
 *
 * <p>{@code revision} and {@code requestId} are shown only to the owner ({@code viewerId} equals the owner). Public and
 * shared routines are readable by guests and other members, and for them these are internal values: the requestId is
 * made by the owner's client, and only the owner can edit, so nobody else needs the revision (security review).
 */
public record RoutineResponse(Long routineId, Long ownerUserId, String routineName, String description,
        Difficulty difficulty, RoutineVisibility visibility,
        @JsonInclude(JsonInclude.Include.NON_NULL) Integer revision,
        @JsonInclude(JsonInclude.Include.NON_NULL) String requestId,
        LocalDateTime createdAt, LocalDateTime updatedAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<Item> items,
        @JsonInclude(JsonInclude.Include.NON_NULL) Boolean created) {

    /** {@code viewerId} is the caller (null for a guest). */
    public static RoutineResponse summary(ExerciseRoutineEntity r, Long viewerId) {
        return of(r, viewerId, null, null);
    }

    public static RoutineResponse detail(ExerciseRoutineEntity r, Long viewerId) {
        return detail(r, viewerId, null);
    }

    public static RoutineResponse detail(ExerciseRoutineEntity r, Long viewerId, Boolean created) {
        return of(r, viewerId, r.getItems().stream().map(Item::from).toList(), created);
    }

    private static RoutineResponse of(ExerciseRoutineEntity r, Long viewerId, List<Item> items, Boolean created) {
        boolean owner = r.isOwnedBy(viewerId);
        return new RoutineResponse(r.getRoutineId(), r.getOwnerUserId(), r.getRoutineName(), r.getDescription(),
                r.getDifficulty(), r.getVisibility(), owner ? r.getRevision() : null,
                owner ? r.getRequestId() : null, r.getCreatedAt(), r.getUpdatedAt(), items, created);
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
