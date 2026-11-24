package com.healthlab.mealthroutine.backend.exercise.dto;

import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutRecordType;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import tools.jackson.databind.annotation.JsonDeserialize;

/**
 * One routine item, in one of two shapes (RoutineService checks which):
 * <ul>
 *   <li>Per-set: {@code recordType} + {@code sets}. The target* fields must be absent; the server fills them from the
 *       sets (count and first set) so a client that only reads targetSets/targetReps in responses still sees a
 *       summary. Nothing on the server reads them: starting a session from a routine copies only the exercises.</li>
 *   <li>Old: {@code targetSets} (required) with optional {@code targetReps} and {@code targetDurationSeconds}.</li>
 * </ul>
 * {@code restSeconds} is allowed in both.
 */
public record RoutineItemRequest(
        @NotNull Long exerciseId,
        @Min(1) Short targetSets,
        @Min(0) Short targetReps,
        @Min(0) Integer targetDurationSeconds,
        @Min(0) Integer restSeconds,
        WorkoutRecordType recordType,
        @JsonDeserialize(using = BoundedListDeserializer.SetTargets.class) @Size(max = 200)
        List<SetTargetRequest> sets) {
}
