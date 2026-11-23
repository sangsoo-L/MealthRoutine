package com.healthlab.mealthroutine.backend.user.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.healthlab.mealthroutine.backend.user.domain.ExerciseLevel;
import com.healthlab.mealthroutine.backend.user.domain.Gender;
import com.healthlab.mealthroutine.backend.user.service.HealthMetricsCalculator.Result;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/** The arithmetic of HEALTH8-9 and HEALTH8-16, with no Spring and no database. */
class HealthMetricsCalculatorTests {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 23);
    private static final LocalDate AGE_25 = LocalDate.of(2001, 11, 23); // 25th birthday today

    @Test
    void theSpecExampleGivesBmi2286Bmr1674Tdee2301() {
        // 발췌본 7.2: 25-year-old man, 175 cm, 70 kg, beginner.
        Result result = calc("175", "70", AGE_25, Gender.MALE, ExerciseLevel.BEGINNER);

        assertThat(result.bmi()).isEqualByComparingTo("22.86");
        assertThat(result.bmi().scale()).isEqualTo(2);
        assertThat(result.bmr()).isEqualTo(1674);
        assertThat(result.activityFactor()).isEqualByComparingTo("1.375");
        // 1673.75 × 1.375 = 2301.40625 → 2301. Using the rounded BMR (1674 × 1.375 = 2301.75) would give 2302.
        assertThat(result.tdee()).isEqualTo(2301);
        assertThat(result.missingFields()).isEmpty();
        assertThat(result.notCalculableFields()).isEmpty();
    }

    @Test
    void genderConstantsAre5Minus161AndMinus78() {
        // 10·60 + 6.25·165 − 5·25 = 1506.25
        assertThat(calc("165", "60", AGE_25, Gender.MALE, ExerciseLevel.UNDECIDED).bmr()).isEqualTo(1511);
        assertThat(calc("165", "60", AGE_25, Gender.FEMALE, ExerciseLevel.UNDECIDED).bmr()).isEqualTo(1345);
        assertThat(calc("165", "60", AGE_25, Gender.OTHER, ExerciseLevel.UNDECIDED).bmr()).isEqualTo(1428);
        assertThat(calc("165", "60", AGE_25, Gender.UNDISCLOSED, ExerciseLevel.UNDECIDED).bmr()).isEqualTo(1428);
    }

    @Test
    void activityFactorsFollowTheExerciseLevel() {
        // BMR before rounding 1428.25 (other, 165 cm, 60 kg, 25)
        assertThat(calc("165", "60", AGE_25, Gender.OTHER, ExerciseLevel.BEGINNER).tdee()).isEqualTo(1964);
        assertThat(calc("165", "60", AGE_25, Gender.OTHER, ExerciseLevel.INTERMEDIATE).tdee()).isEqualTo(2214);
        assertThat(calc("165", "60", AGE_25, Gender.OTHER, ExerciseLevel.ADVANCED).tdee()).isEqualTo(2464);
        assertThat(calc("165", "60", AGE_25, Gender.OTHER, ExerciseLevel.UNDECIDED).tdee()).isEqualTo(1714);
        assertThat(HealthMetricsCalculator.activityFactor(null)).isEqualByComparingTo("1.2");
    }

    @Test
    void ageIsCountedOnlyFromTheBirthday() {
        // Birthday today: 25. Birthday tomorrow: still 24, so the BMR is 5 higher.
        int today = calc("175", "70", AGE_25, Gender.MALE, ExerciseLevel.BEGINNER).bmr();
        int tomorrow = calc("175", "70", AGE_25.plusDays(1), Gender.MALE, ExerciseLevel.BEGINNER).bmr();
        assertThat(tomorrow - today).isEqualTo(5);
        // Born on 29 February: on 28 February of a common year the birthday has not come yet.
        assertThat(HealthMetricsCalculator.calculate(new BigDecimal("175"), new BigDecimal("70"),
                LocalDate.of(2004, 2, 29), Gender.MALE, ExerciseLevel.BEGINNER, LocalDate.of(2027, 2, 28)).bmr())
                .isEqualTo(HealthMetricsCalculator.calculate(new BigDecimal("175"), new BigDecimal("70"),
                        LocalDate.of(2004, 3, 1), Gender.MALE, ExerciseLevel.BEGINNER, LocalDate.of(2027, 2, 28))
                        .bmr());
    }

    @Test
    void bmiRoundsHalfUpAtTheThirdDecimal() {
        // 200 cm, 101 kg: 101 / 4 = 25.25 exactly. 200 cm, 100.02 kg: 25.005 → 25.01 (HALF_UP, not 25.00).
        assertThat(HealthMetricsCalculator.bmi(new BigDecimal("200"), new BigDecimal("101")))
                .isEqualByComparingTo("25.25");
        assertThat(HealthMetricsCalculator.bmi(new BigDecimal("200"), new BigDecimal("100.02")))
                .isEqualByComparingTo("25.01");
        assertThat(HealthMetricsCalculator.bmi(null, new BigDecimal("70"))).isNull();
        assertThat(HealthMetricsCalculator.bmi(new BigDecimal("175"), null)).isNull();
    }

    @Test
    void bmrAndTdeeRoundHalfUp() {
        // female, 160 cm, 50.5 kg, 25: 505 + 1000 − 125 − 161 = 1219 → TDEE 1219 × 1.55 = 1889.45 → 1889
        Result result = calc("160", "50.5", AGE_25, Gender.FEMALE, ExerciseLevel.INTERMEDIATE);
        assertThat(result.bmr()).isEqualTo(1219);
        assertThat(result.tdee()).isEqualTo(1889);
        // male, 170.2 cm, 70 kg, 25: 700 + 1063.75 − 125 + 5 = 1643.75 → 1644 (.75 up)
        assertThat(calc("170.2", "70", AGE_25, Gender.MALE, ExerciseLevel.UNDECIDED).bmr()).isEqualTo(1644);
        // male, 170.1 cm, 70 kg, 25: 700 + 1063.125 − 120 = 1643.125 → 1643 (down)
        assertThat(calc("170.1", "70", AGE_25, Gender.MALE, ExerciseLevel.UNDECIDED).bmr()).isEqualTo(1643);
        // male, 170 cm, 70.1 kg, 25: 701 + 1062.5 − 120 = 1643.5 → 1644 (exactly .5 goes up)
        assertThat(calc("170", "70.1", AGE_25, Gender.MALE, ExerciseLevel.UNDECIDED).bmr()).isEqualTo(1644);
    }

    @Test
    void missingInputsAreListedInAFixedOrderAndOnlyBmiIsGivenWhenPossible() {
        Result nothing = HealthMetricsCalculator.calculate(null, null, null, null, null, TODAY);
        assertThat(nothing.missingFields()).containsExactly("heightCm", "weightKg", "birthDate", "gender");
        assertThat(nothing.bmi()).isNull();
        assertThat(nothing.bmr()).isNull();
        assertThat(nothing.tdee()).isNull();
        assertThat(nothing.activityFactor()).isEqualByComparingTo("1.2");
        assertThat(nothing.notCalculableFields()).isEmpty();

        Result noProfile = HealthMetricsCalculator.calculate(new BigDecimal("175"), new BigDecimal("70"), null, null,
                ExerciseLevel.ADVANCED, TODAY);
        assertThat(noProfile.missingFields()).containsExactly("birthDate", "gender");
        assertThat(noProfile.bmi()).isEqualByComparingTo("22.86");
        assertThat(noProfile.bmr()).isNull();
        assertThat(noProfile.tdee()).isNull();

        assertThat(calc(null, "70", AGE_25, Gender.MALE, null).missingFields()).containsExactly("heightCm");
        assertThat(calc("175", null, AGE_25, null, null).missingFields()).containsExactly("weightKg", "gender");
    }

    @Test
    void aBmrOfZeroOrLessIsNotCalculable() {
        // 1 cm, 1 kg, man, 25: 10 + 6.25 − 125 + 5 = −103.75
        Result negative = calc("1", "1", AGE_25, Gender.MALE, ExerciseLevel.BEGINNER);
        assertThat(negative.bmr()).isNull();
        assertThat(negative.tdee()).isNull();
        assertThat(negative.notCalculableFields()).containsExactly("bmr", "tdee");
        assertThat(negative.missingFields()).isEmpty();
        assertThat(negative.bmi()).isEqualByComparingTo("10000.00"); // BMI is still a number (no judgement)

        // 17.6 cm, 1 kg, man, 25: 10 + 110 − 120 = exactly 0 → not calculable
        Result zero = calc("17.6", "1", AGE_25, Gender.MALE, ExerciseLevel.BEGINNER);
        assertThat(zero.bmr()).isNull();
        assertThat(zero.notCalculableFields()).containsExactly("bmr", "tdee");
    }

    @Test
    void aSmallPositiveBmrIsANormalResultEvenWhenItRoundsToZero() {
        // 15.7 cm, 2.2 kg, man, 25: 22 + 98.125 − 120 = 0.125 → bmr 0, tdee 0.17 → 0, nothing listed
        Result result = calc("15.7", "2.2", AGE_25, Gender.MALE, ExerciseLevel.BEGINNER);
        assertThat(result.bmr()).isZero();
        assertThat(result.tdee()).isZero();
        assertThat(result.notCalculableFields()).isEmpty();
        assertThat(result.missingFields()).isEmpty();
    }

    @Test
    void theLargestAcceptedInputsStillFit() {
        // 300 cm, 500 kg: BMI 55.56; 1 cm, 500 kg: BMI 5,000,000.00 — both returned as numbers.
        assertThat(HealthMetricsCalculator.bmi(new BigDecimal("300"), new BigDecimal("500")))
                .isEqualByComparingTo("55.56");
        assertThat(HealthMetricsCalculator.bmi(BigDecimal.ONE, new BigDecimal("500")))
                .isEqualByComparingTo("5000000.00");
        Result big = calc("300", "500", LocalDate.of(2025, 11, 23), Gender.MALE, ExerciseLevel.ADVANCED);
        assertThat(big.bmr()).isEqualTo(6875); // 5000 + 1875 − 5 + 5
        assertThat(big.tdee()).isEqualTo(11859);
    }

    private static Result calc(String heightCm, String weightKg, LocalDate birthDate, Gender gender,
            ExerciseLevel level) {
        return HealthMetricsCalculator.calculate(heightCm == null ? null : new BigDecimal(heightCm),
                weightKg == null ? null : new BigDecimal(weightKg), birthDate, gender, level, TODAY);
    }
}
