package com.healthlab.mealthroutine.backend.exercise.service;

import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutRecordType;
import com.healthlab.mealthroutine.backend.exercise.dto.SessionRecordRequest.CompletedSet;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Checks the actual values of completed sets against the record type, following the frontend's PerformedSet and
 * completed-set rules (workoutTypes.ts, completedSetValidation.ts). Any problem is a 400 INVALID_REQUEST.
 *
 * <pre>
 * recordType   reps (required)   weightKg (optional)   durationSeconds (optional, measured time)
 * reps         yes
 * weight       yes               yes
 * time                                                 yes
 * time_reps    yes                                     yes
 * weight_time                    yes                   yes
 * </pre>
 *
 * Time is optional because a timed set done without the timer has no measured time (null, not 0).
 */
final class CompletedSetValidator {

    /** The frontend caps a measured set at 24 hours (workoutModel.MAX_MEASURED_MS). */
    static final int MAX_DURATION_SECONDS = 24 * 60 * 60;

    private CompletedSetValidator() {
    }

    /** One validated completed set, ready to store. */
    record Done(short setNumber, Short reps, BigDecimal weightKg, Integer durationSeconds) {
    }

    /** {@code plannedSetCount} is the number of target sets; set numbers must be 1..that, strictly increasing. */
    static List<Done> validate(WorkoutRecordType type, int plannedSetCount, List<CompletedSet> sets) {
        if (sets.size() > plannedSetCount) {
            throw SetTargetValidator.invalid();
        }
        boolean usesReps = type == WorkoutRecordType.REPS || type == WorkoutRecordType.WEIGHT
                || type == WorkoutRecordType.TIME_REPS;
        boolean allowsWeight = type == WorkoutRecordType.WEIGHT || type == WorkoutRecordType.WEIGHT_TIME;
        boolean allowsDuration = type == WorkoutRecordType.TIME || type == WorkoutRecordType.TIME_REPS
                || type == WorkoutRecordType.WEIGHT_TIME;

        List<Done> result = new ArrayList<>(sets.size());
        int previous = 0;
        for (CompletedSet set : sets) {
            if (set == null || set.setNumber() == null || usesReps != (set.reps() != null)
                    || (!allowsWeight && set.weightKg() != null)
                    || (!allowsDuration && set.durationSeconds() != null)) {
                throw SetTargetValidator.invalid();
            }
            int setNumber = SetTargetValidator.wholeNumber(set.setNumber(), 1, plannedSetCount);
            if (setNumber <= previous) {
                throw SetTargetValidator.invalid();
            }
            previous = setNumber;
            Short reps = usesReps
                    ? SetTargetValidator.wholeNumber(set.reps(), 1, SetTargetValidator.MAX_REPS).shortValue()
                    : null;
            BigDecimal weight = set.weightKg() == null ? null : SetTargetValidator.weight(set.weightKg());
            Integer duration = set.durationSeconds() == null ? null
                    : SetTargetValidator.wholeNumber(set.durationSeconds(), 0, MAX_DURATION_SECONDS);
            result.add(new Done((short) setNumber, reps, weight, duration));
        }
        return List.copyOf(result);
    }
}
