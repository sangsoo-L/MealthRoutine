package com.healthlab.mealthroutine.backend.exercise.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "preference_exercises")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PreferenceExerciseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long preferenceExercisesId;

    private Long userId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "exercise_id")
    private ExerciseEntity exercise;

    private LocalDateTime createdAt = LocalDateTime.now();

    public PreferenceExerciseEntity(Long userId, ExerciseEntity exercise) {
        this.userId = userId;
        this.exercise = exercise;
    }
}
