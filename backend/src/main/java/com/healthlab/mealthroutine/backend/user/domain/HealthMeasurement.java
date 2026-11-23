package com.healthlab.mealthroutine.backend.user.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * health_measurements table: one row per body measurement. POST always adds a new row (HEALTH8-6).
 * <p>
 * Not mapped on purpose: bmi (never written — BMI is calculated when read, HEALTH8-A, so the column stays NULL),
 * source, is_estimated and created_at (DB defaults 'manual', FALSE, CURRENT_TIMESTAMP).
 * There is no updated_at column, so a change leaves no history.
 */
@Entity
@Table(name = "health_measurements")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class HealthMeasurement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long measurementId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", updatable = false)
    private User user;

    private LocalDateTime measuredAt;

    private BigDecimal heightCm;

    private BigDecimal weightKg;

    private BigDecimal bodyFatPct;

    private BigDecimal skeletalMuscleKg;

    public HealthMeasurement(User user, LocalDateTime measuredAt, MeasurementValues values) {
        this.user = user;
        this.measuredAt = measuredAt;
        this.heightCm = values.heightCm();
        this.weightKg = values.weightKg();
        this.bodyFatPct = values.bodyFatPct();
        this.skeletalMuscleKg = values.skeletalMuscleKg();
    }

    /** PATCH: only the given (non-null) values change; a value can never be cleared (HEALTH8-8). */
    public void apply(LocalDateTime newMeasuredAt, MeasurementValues values) {
        if (newMeasuredAt != null) {
            this.measuredAt = newMeasuredAt;
        }
        if (values.heightCm() != null) {
            this.heightCm = values.heightCm();
        }
        if (values.weightKg() != null) {
            this.weightKg = values.weightKg();
        }
        if (values.bodyFatPct() != null) {
            this.bodyFatPct = values.bodyFatPct();
        }
        if (values.skeletalMuscleKg() != null) {
            this.skeletalMuscleKg = values.skeletalMuscleKg();
        }
    }

    /** The four measured values; any of them may be null. */
    public record MeasurementValues(BigDecimal heightCm, BigDecimal weightKg, BigDecimal bodyFatPct,
            BigDecimal skeletalMuscleKg) {

        public boolean isEmpty() {
            return heightCm == null && weightKg == null && bodyFatPct == null && skeletalMuscleKg == null;
        }

        /** Hides the body values if this object is ever logged. */
        @Override
        public String toString() {
            return "MeasurementValues[(hidden)]";
        }
    }
}
