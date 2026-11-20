package com.healthlab.mealthroutine.backend.diet.domain;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "preference_meal")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)

public class PreferenceMeal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long preferenceMealId;

    private Long userId; //누가

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "food_id")
    private Food food; //어떤 음식을 찜했는지

    private LocalDateTime createdAt = LocalDateTime.now(); // 찜한 시각

    public PreferenceMeal(Long userId,Food food){
        this.userId = userId;
        this.food = food;
    }
}
