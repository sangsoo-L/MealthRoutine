package com.healthlab.mealthroutine.backend.exercise.dto;

import com.healthlab.mealthroutine.backend.exercise.domain.CatalogRecordMode;
import com.healthlab.mealthroutine.backend.exercise.domain.Difficulty;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseEntity;
import java.util.List;

/**
 * One exercise. defaultRecordMode and allowedRecordModes are catalog codes (weight+reps is weight_reps). Both are null
 * together when the row has no record-mode data or the two do not agree (the default is not in the allowed list); the
 * frontend then picks a record mode by its own rules.
 */
public record ExerciseResponse(Long exerciseId, String name, String instructions, Difficulty difficulty,
        String exerciseType, String exerciseEquipment, String description, String cautions, String sourceUrl,
        CatalogRecordMode defaultRecordMode, List<CatalogRecordMode> allowedRecordModes) {

    public static ExerciseResponse from(ExerciseEntity e) {
        CatalogRecordMode defaultMode = e.getDefaultRecordMode();
        List<CatalogRecordMode> allowed = CatalogRecordMode.readAllowed(e.getAllowedRecordModes());
        boolean valid = defaultMode != null && allowed != null && allowed.contains(defaultMode);
        return new ExerciseResponse(e.getExerciseId(), e.getName(), e.getInstructions(), e.getDifficulty(),
                e.getExerciseType(), e.getExerciseEquipment(), e.getDescription(), e.getCautions(), e.getSourceUrl(),
                valid ? defaultMode : null, valid ? allowed : null);
    }
}
