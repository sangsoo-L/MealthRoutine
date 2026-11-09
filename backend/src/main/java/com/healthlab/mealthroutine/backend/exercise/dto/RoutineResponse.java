package com.healthlab.mealthroutine.backend.exercise.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.healthlab.mealthroutine.backend.exercise.domain.Difficulty;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseRoutineEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseRoutineItemEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.RoutineVisibility;
import java.time.LocalDateTime;
import java.util.List;

public record RoutineResponse(Long routineId, Long ownerUserId, String routineName, String description,
        Difficulty difficulty, RoutineVisibility visibility, LocalDateTime createdAt, LocalDateTime updatedAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<Item> items) {

    public static RoutineResponse summary(ExerciseRoutineEntity r) {
        return of(r, null);
    }

    public static RoutineResponse detail(ExerciseRoutineEntity r) {
        return of(r, r.getItems().stream().map(Item::from).toList());
    }

    private static RoutineResponse of(ExerciseRoutineEntity r, List<Item> items) {
        return new RoutineResponse(r.getRoutineId(), r.getOwnerUserId(), r.getRoutineName(), r.getDescription(),
                r.getDifficulty(), r.getVisibility(), r.getCreatedAt(), r.getUpdatedAt(), items);
    }

    public record Item(Long exerciseRoutineItemId, Long exerciseId, String exerciseName, Short sequenceNumber,
            Short targetSets, Short targetReps, Integer targetDurationSeconds, Integer restSeconds) {

        static Item from(ExerciseRoutineItemEntity i) {
            return new Item(i.getExerciseRoutineItemId(), i.getExercise().getExerciseId(), i.getExercise().getName(),
                    i.getSequenceNumber(), i.getTargetSets(), i.getTargetReps(), i.getTargetDurationSeconds(),
                    i.getRestSeconds());
        }
    }
}
