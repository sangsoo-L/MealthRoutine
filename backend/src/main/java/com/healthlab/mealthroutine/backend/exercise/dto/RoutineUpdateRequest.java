package com.healthlab.mealthroutine.backend.exercise.dto;

import com.healthlab.mealthroutine.backend.exercise.domain.Difficulty;
import com.healthlab.mealthroutine.backend.exercise.domain.RoutineVisibility;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * Null fields stay unchanged. When items is present it replaces the whole list. When expectedRevision is present and
 * differs from the routine's revision the update is refused with 409 REVISION_MISMATCH (data.currentRevision).
 *
 * <p>If an exercise that has per-set targets would come back in the old shape (targetSets only), the update is
 * refused with 409 SET_TARGETS_WOULD_BE_LOST, because those per-set targets cannot be kept. Send
 * {@code discardSetTargets: true} to make that change on purpose. Items that were old-style already, a reordered
 * list and removed exercises need no flag.
 */
public record RoutineUpdateRequest(
        @Size(min = 1, max = 160) String routineName,
        String description,
        Difficulty difficulty,
        RoutineVisibility visibility,
        @Size(min = 1, max = 100) List<@NotNull @Valid RoutineItemRequest> items,
        @Min(1) Integer expectedRevision,
        Boolean discardSetTargets) {
}
