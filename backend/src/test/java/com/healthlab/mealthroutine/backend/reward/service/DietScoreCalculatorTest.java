package com.healthlab.mealthroutine.backend.reward.service;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;


class DietScoreCalculatorTest {
    
    private final DietScoreCalculator calc = new DietScoreCalculator(); // 스프링·DB 없이 바로 생성

    @Test
    void 칼로리_오차별_점수() {
        assertThat(calc.calories(2000, 2000)).isEqualTo(30); // 딱 맞으면 30점
        assertThat(calc.calories(2200, 2000)).isEqualTo(30); // +10% 경계 → 30점
        assertThat(calc.calories(1600, 2000)).isEqualTo(20); // -20% → 20점
        assertThat(calc.calories(2600, 2000)).isEqualTo(10); // +30% 경계 → 10점
        assertThat(calc.calories(2700, 2000)).isEqualTo(0);  // 30% 넘으면 0점
    }

    @Test
    void 탄단지_오차별_점수() {
        assertThat(calc.macro(115, 100)).isEqualTo(10); // +15% 경계 → 10점
        assertThat(calc.macro(70, 100)).isEqualTo(5);   // -30% 경계 → 5점
        assertThat(calc.macro(140, 100)).isEqualTo(0);  // 30% 넘으면 0점
    }

    @Test
    void 목표가_없으면_0점() {
        assertThat(calc.calories(1500, 0)).isEqualTo(0); // 목표 0이면 나누지 않고 0점
        assertThat(calc.macro(50, 0)).isEqualTo(0);
    }
}