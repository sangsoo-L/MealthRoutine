package com.healthlab.mealthroutine.backend.exercise.dto;

import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutRecordType;
import com.healthlab.mealthroutine.backend.user.dto.StrictDecimalDeserializer;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import tools.jackson.databind.annotation.JsonDeserialize;

/**
 * One finished workout uploaded in a single request (POST /workout-sessions/records). It is saved as a completed
 * session at once, so a failure never leaves a half-written record, and repeating the same requestId never saves it
 * twice.
 *
 * <p>startedAt and endedAt must carry an offset (2026-11-24T05:00:00Z). They are stored as Korean time, the same
 * clock the stats and the daily reward check use.
 *
 * <p>Per exercise, setTargets is the plan (SetTargetValidator rules) and completedSets holds only the sets that were
 * done, each with its 1-based position in setTargets, so set numbers may skip. See CompletedSetValidator for which
 * actual values each record type allows.
 */
public record SessionRecordRequest(
        @NotNull @Pattern(regexp = "^[0-9A-Za-z_-]{1,100}$") String requestId,
        @NotNull OffsetDateTime startedAt,
        @NotNull OffsetDateTime endedAt,
        @NotEmpty @Size(max = 100) List<@NotNull @Valid Exercise> exercises) {

    public record Exercise(
            @NotNull Long exerciseId,
            @NotNull WorkoutRecordType recordType,
            @NotNull List<SetTargetRequest> setTargets,
            @NotNull List<CompletedSet> completedSets) {
    }

    /** Every number is read as an exact JSON number, so 10.5 reps is a 400 instead of being cut to 10. */
    public record CompletedSet(
            @JsonDeserialize(using = StrictDecimalDeserializer.class) BigDecimal setNumber,
            @JsonDeserialize(using = StrictDecimalDeserializer.class) BigDecimal reps,
            @JsonDeserialize(using = StrictDecimalDeserializer.class) BigDecimal weightKg,
            @JsonDeserialize(using = StrictDecimalDeserializer.class) BigDecimal durationSeconds) {
    }
}
