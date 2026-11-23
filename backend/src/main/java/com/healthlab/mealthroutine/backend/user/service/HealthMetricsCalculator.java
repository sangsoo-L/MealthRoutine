package com.healthlab.mealthroutine.backend.user.service;

import com.healthlab.mealthroutine.backend.user.domain.ExerciseLevel;
import com.healthlab.mealthroutine.backend.user.domain.Gender;
import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.Period;
import java.util.ArrayList;
import java.util.List;

/**
 * BMI, BMR and TDEE estimates (Q-07, 발췌본 7.2, HEALTH8-9, HEALTH8-16). Pure arithmetic with no database, so the
 * rules are tested on their own. Everything is BigDecimal and rounds HALF_UP.
 * <ul>
 *   <li>BMI = kg / m², two decimals.</li>
 *   <li>BMR (Mifflin-St Jeor) = 10·kg + 6.25·cm − 5·age + s, with s = +5 (male), −161 (female), −78 (other,
 *       undisclosed); a whole number.</li>
 *   <li>TDEE = the BMR BEFORE rounding × activity factor, a whole number (7.2 example: 1673.75 × 1.375 → 2301).</li>
 *   <li>If every input is there but the BMR before rounding is 0 or less, bmr and tdee are null and listed in
 *       notCalculable; nothing is adjusted to look valid. A BMR above 0 is a normal result even if it rounds
 *       to 0.</li>
 * </ul>
 */
public final class HealthMetricsCalculator {

    public static final String FORMULA = "Mifflin-St Jeor";

    private static final BigDecimal TEN_THOUSAND = new BigDecimal("10000");
    private static final BigDecimal TEN = BigDecimal.TEN;
    private static final BigDecimal HEIGHT_FACTOR = new BigDecimal("6.25");
    private static final BigDecimal FIVE = new BigDecimal("5");

    private HealthMetricsCalculator() {
    }

    /** BMI from one height and one weight; null unless both are there. */
    public static BigDecimal bmi(BigDecimal heightCm, BigDecimal weightKg) {
        if (heightCm == null || weightKg == null) {
            return null;
        }
        return weightKg.multiply(TEN_THOUSAND)
                .divide(heightCm.multiply(heightCm), MathContext.DECIMAL128)
                .setScale(2, RoundingMode.HALF_UP);
    }

    /** Activity factor from user_profiles.exercise_level; a missing level counts as undecided (1.2). */
    public static BigDecimal activityFactor(ExerciseLevel level) {
        return switch (level == null ? ExerciseLevel.UNDECIDED : level) {
            case BEGINNER -> new BigDecimal("1.375");
            case INTERMEDIATE -> new BigDecimal("1.55");
            case ADVANCED -> new BigDecimal("1.725");
            case UNDECIDED -> new BigDecimal("1.2");
        };
    }

    public static Result calculate(BigDecimal heightCm, BigDecimal weightKg, LocalDate birthDate, Gender gender,
            ExerciseLevel level, LocalDate today) {
        List<String> missing = new ArrayList<>();
        if (heightCm == null) {
            missing.add("heightCm");
        }
        if (weightKg == null) {
            missing.add("weightKg");
        }
        if (birthDate == null) {
            missing.add("birthDate");
        }
        if (gender == null) {
            missing.add("gender");
        }
        BigDecimal factor = activityFactor(level);
        BigDecimal bmi = bmi(heightCm, weightKg);
        if (!missing.isEmpty()) {
            return new Result(bmi, null, factor, null, List.copyOf(missing), List.of());
        }
        int age = Period.between(birthDate, today).getYears();
        BigDecimal rawBmr = TEN.multiply(weightKg)
                .add(HEIGHT_FACTOR.multiply(heightCm))
                .subtract(FIVE.multiply(BigDecimal.valueOf(age)))
                .add(genderConstant(gender));
        if (rawBmr.signum() <= 0) {
            return new Result(bmi, null, factor, null, List.of(), List.of("bmr", "tdee"));
        }
        int bmr = rawBmr.setScale(0, RoundingMode.HALF_UP).intValueExact();
        int tdee = rawBmr.multiply(factor).setScale(0, RoundingMode.HALF_UP).intValueExact();
        return new Result(bmi, bmr, factor, tdee, List.of(), List.of());
    }

    private static BigDecimal genderConstant(Gender gender) {
        return switch (gender) {
            case MALE -> new BigDecimal("5");
            case FEMALE -> new BigDecimal("-161");
            case OTHER, UNDISCLOSED -> new BigDecimal("-78");
        };
    }

    public record Result(BigDecimal bmi, Integer bmr, BigDecimal activityFactor, Integer tdee,
            List<String> missingFields, List<String> notCalculableFields) {
    }
}
