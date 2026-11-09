package com.healthlab.mealthroutine.backend.exercise.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Read-only here: exercises come from seed SQL, and the API has no way to change them. */
@Entity
@Table(name = "exercises")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ExerciseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long exerciseId;

    private String name;

    @Column(columnDefinition = "TEXT")
    private String instructions;

    private Difficulty difficulty;

    private String exerciseType;

    private String exerciseEquipment;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(columnDefinition = "TEXT")
    private String cautions;

    private String sourceUrl;
}
