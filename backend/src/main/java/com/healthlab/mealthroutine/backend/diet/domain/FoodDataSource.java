package com.healthlab.mealthroutine.backend.diet.domain;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Table(name = "food_data_sources")
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FoodDataSource {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long sourceId;

    @Column(nullable = false , length = 160)
    private String sourceName; // 식품의약품안전처

    @Column(length = 1000)
    private String sourceUrl; // 공공데이터포털 주소

    public FoodDataSource(String sourceName, String sourceUrl) {
        this.sourceName = sourceName;
        this.sourceUrl = sourceUrl;
    }
}
