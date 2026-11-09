package com.healthlab.mealthroutine.backend.exercise.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "exercise_routines")
@Getter
@Setter
@NoArgsConstructor
public class ExerciseRoutineEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long routineId;

    private Long ownerUserId;

    private String routineName;

    @Column(columnDefinition = "TEXT")
    private String description;

    private Difficulty difficulty;

    private RoutineVisibility visibility = RoutineVisibility.PRIVATE;

    private LocalDateTime createdAt = LocalDateTime.now();

    private LocalDateTime updatedAt = LocalDateTime.now();

    @OneToMany(mappedBy = "routine", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sequenceNumber")
    private List<ExerciseRoutineItemEntity> items = new ArrayList<>();

    public boolean isOwnedBy(Long userId) {
        return userId != null && userId.equals(ownerUserId);
    }

    public boolean isReadableBy(Long userId) {
        return visibility != RoutineVisibility.PRIVATE || isOwnedBy(userId);
    }
}
