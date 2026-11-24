package com.healthlab.mealthroutine.backend.exercise.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutRecordType;
import com.healthlab.mealthroutine.backend.exercise.dto.SetTarget;
import com.healthlab.mealthroutine.backend.exercise.dto.SetTargetRequest;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Checks per-set targets against the record type, with the same rules and limits as the frontend (NormalizedSet in
 * workoutDraftTypes.ts, limits in workoutDraftModel.ts and setInput.ts). Any problem is a 400 INVALID_REQUEST.
 *
 * <pre>
 * recordType   required              optional
 * reps         reps
 * weight       reps                  weightKg
 * time         targetSeconds
 * time_reps    reps, targetSeconds
 * weight_time  targetSeconds         weightKg
 * </pre>
 *
 * A field the type does not use is rejected, not dropped, so the client learns its data does not fit.
 */
public final class SetTargetValidator {

    static final int MAX_SETS = 200;
    static final int MAX_REPS = 999;
    static final BigDecimal MAX_WEIGHT_KG = new BigDecimal("999");
    static final int MAX_TARGET_SECONDS = 3600;

    private SetTargetValidator() {
    }

    public static List<SetTarget> validate(WorkoutRecordType recordType, List<SetTargetRequest> sets) {
        if (recordType == null || sets == null || sets.isEmpty() || sets.size() > MAX_SETS) {
            throw invalid();
        }
        List<SetTarget> result = new ArrayList<>(sets.size());
        for (SetTargetRequest set : sets) {
            if (set == null) {
                throw invalid();
            }
            result.add(validateOne(recordType, set));
        }
        return List.copyOf(result);
    }

    private static SetTarget validateOne(WorkoutRecordType type, SetTargetRequest set) {
        boolean usesReps = type == WorkoutRecordType.REPS || type == WorkoutRecordType.WEIGHT
                || type == WorkoutRecordType.TIME_REPS;
        boolean usesSeconds = type == WorkoutRecordType.TIME || type == WorkoutRecordType.TIME_REPS
                || type == WorkoutRecordType.WEIGHT_TIME;
        boolean usesWeight = type == WorkoutRecordType.WEIGHT || type == WorkoutRecordType.WEIGHT_TIME;

        // Reps and seconds are required whenever the type uses them; weight is always optional.
        if (usesReps != (set.reps() != null) || usesSeconds != (set.targetSeconds() != null)
                || (!usesWeight && set.weightKg() != null)) {
            throw invalid();
        }
        Integer reps = usesReps ? wholeNumber(set.reps(), 1, MAX_REPS) : null;
        Integer seconds = usesSeconds ? wholeNumber(set.targetSeconds(), 1, MAX_TARGET_SECONDS) : null;
        BigDecimal weight = set.weightKg() == null ? null : weight(set.weightKg());
        return new SetTarget(reps, weight, seconds);
    }

    private static Integer wholeNumber(BigDecimal value, int min, int max) {
        BigDecimal stripped = value.stripTrailingZeros();
        if (stripped.scale() > 0 || stripped.compareTo(BigDecimal.valueOf(min)) < 0
                || stripped.compareTo(BigDecimal.valueOf(max)) > 0) {
            throw invalid();
        }
        return stripped.intValueExact();
    }

    /** 0 to 999 kg with at most 2 decimal places. Stored without trailing zeros: 22.50 becomes 22.5, 40.0 becomes 40. */
    private static BigDecimal weight(BigDecimal value) {
        BigDecimal stripped = value.stripTrailingZeros();
        if (stripped.scale() > 2 || stripped.signum() < 0 || stripped.compareTo(MAX_WEIGHT_KG) > 0) {
            throw invalid();
        }
        return stripped.scale() < 0 ? stripped.setScale(0) : stripped;
    }

    private static BusinessException invalid() {
        return new BusinessException(ErrorCode.INVALID_REQUEST);
    }
}
