package com.healthlab.mealthroutine.backend.exercise.dto;

import com.healthlab.mealthroutine.backend.exercise.domain.Difficulty;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseEntity;

public record ExerciseResponse(Long exerciseId, String name, String instructions, Difficulty difficulty,
        String exerciseType, String exerciseEquipment, String description, String cautions, String sourceUrl) {

    public static ExerciseResponse from(ExerciseEntity e) {
        return new ExerciseResponse(e.getExerciseId(), e.getName(), e.getInstructions(), e.getDifficulty(),
                e.getExerciseType(), e.getExerciseEquipment(), e.getDescription(), e.getCautions(), e.getSourceUrl());
    }
}
