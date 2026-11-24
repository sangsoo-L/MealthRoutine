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
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "exercise_routine_items")
@Getter
@Setter
@NoArgsConstructor
public class ExerciseRoutineItemEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long exerciseRoutineItemId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "routine_id")
    private ExerciseRoutineEntity routine;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "exercise_id")
    private ExerciseEntity exercise;

    private Short sequenceNumber;

    private Short targetSets;

    private Short targetReps;

    private Integer targetDurationSeconds;

    private Integer restSeconds;

    /** Null for items saved the old way (targetSets/targetReps only). Present together with setTargets. */
    private WorkoutRecordType recordType;

    /** Per-set targets as JSON text (SetTargetsJson). The target_* columns above keep the set count and first set. */
    @JdbcTypeCode(SqlTypes.JSON)
    private String setTargets;

    private LocalDateTime createdAt = LocalDateTime.now();
}
