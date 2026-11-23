package com.healthlab.mealthroutine.backend.user.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.user.domain.HealthMeasurement.MeasurementValues;
import com.healthlab.mealthroutine.backend.user.dto.MeasurementRequest;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.time.temporal.ChronoUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Every input check for the body measurement APIs that needs no database (HEALTH8-3~6). Controllers call these
 * BEFORE the PIN check, so a bad request is always a 400 first; after the PIN check only a 404 can still happen
 * (HEALTH8-12). Every failure is 400 INVALID_REQUEST.
 * <p>
 * The ranges are what this service accepts as input, not medical normal ranges.
 */
@Component
@RequiredArgsConstructor
public class MeasurementRules {

    static final BigDecimal HEIGHT_MIN = BigDecimal.ONE;
    static final BigDecimal HEIGHT_MAX = new BigDecimal("300");
    static final BigDecimal WEIGHT_MIN = BigDecimal.ONE;
    static final BigDecimal WEIGHT_MAX = new BigDecimal("500");
    static final BigDecimal BODY_FAT_MIN = BigDecimal.ONE;
    static final BigDecimal BODY_FAT_MAX = new BigDecimal("80");
    static final BigDecimal MUSCLE_MIN = BigDecimal.ONE;
    static final BigDecimal MUSCLE_MAX = new BigDecimal("200");

    static final int DEFAULT_LIMIT = 30;
    static final int MAX_LIMIT = 100;

    private static final LocalDateTime EARLIEST = LocalDateTime.of(1900, 1, 1, 0, 0);
    private static final LocalDate EARLIEST_DATE = EARLIEST.toLocalDate();
    // The date pattern accepts more than four year digits (+999999999-12-31); anything past year 9999 is a 400,
    // never an overflow (500) in the list bounds below.
    private static final LocalDate LATEST_DATE = LocalDate.of(9999, 12, 31);
    // DATETIME stops at year 9999; the list query's upper bound must stay inside it.
    private static final LocalDateTime LIST_END = LocalDateTime.of(9999, 12, 31, 0, 0);
    private static final DateTimeFormatter MEASURED_AT =
            DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss").withResolverStyle(ResolverStyle.STRICT);
    private static final DateTimeFormatter DATE =
            DateTimeFormatter.ofPattern("uuuu-MM-dd").withResolverStyle(ResolverStyle.STRICT);

    private final Clock clock;

    /** POST: a new row needs a height or a weight (HEALTH8-4); measuredAt left out means now (DC-05). */
    public NewMeasurement forCreate(MeasurementRequest request) {
        MeasurementValues values = values(request);
        if (values.heightCm() == null && values.weightKg() == null) {
            throw invalid();
        }
        LocalDateTime measuredAt = request.measuredAt() == null ? now() : measuredAt(request.measuredAt());
        return new NewMeasurement(measuredAt, values);
    }

    /** PATCH: every field may be left out (no change); measuredAt is null when it does not change. */
    public MeasurementChange forUpdate(MeasurementRequest request) {
        MeasurementValues values = values(request);
        LocalDateTime measuredAt = request.measuredAt() == null ? null : measuredAt(request.measuredAt());
        return new MeasurementChange(measuredAt, values);
    }

    /** GET list query: from/to are dates (both ends included), limit 1~100 (default 30). */
    public ListQuery forList(String from, String to, Integer limit) {
        LocalDate fromDate = from == null ? null : date(from);
        LocalDate toDate = to == null ? null : date(to);
        if (fromDate != null && toDate != null && fromDate.isAfter(toDate)) {
            throw invalid();
        }
        int size = limit == null ? DEFAULT_LIMIT : limit;
        if (size < 1 || size > MAX_LIMIT) {
            throw invalid();
        }
        LocalDateTime start = fromDate == null ? EARLIEST : fromDate.atStartOfDay();
        LocalDateTime end = toDate == null ? LIST_END : toDate.plusDays(1).atStartOfDay();
        return new ListQuery(start, end.isAfter(LIST_END) ? LIST_END : end, size);
    }

    private MeasurementValues values(MeasurementRequest request) {
        return new MeasurementValues(
                checked(request.heightCm(), HEIGHT_MIN, HEIGHT_MAX),
                checked(request.weightKg(), WEIGHT_MIN, WEIGHT_MAX),
                checked(request.bodyFatPct(), BODY_FAT_MIN, BODY_FAT_MAX),
                checked(request.skeletalMuscleKg(), MUSCLE_MIN, MUSCLE_MAX));
    }

    /** In range and at most one decimal place (170.50 counts as 170.5). */
    private static BigDecimal checked(BigDecimal value, BigDecimal min, BigDecimal max) {
        if (value == null) {
            return null;
        }
        if (value.compareTo(min) < 0 || value.compareTo(max) > 0 || value.stripTrailingZeros().scale() > 1) {
            throw invalid();
        }
        return value;
    }

    /** "" or spaces are 400, not "left out" (HEALTH8-5). No time zone; not in the future; 1900 or later. */
    private LocalDateTime measuredAt(String text) {
        LocalDateTime value;
        try {
            value = LocalDateTime.parse(text, MEASURED_AT);
        } catch (DateTimeParseException e) {
            throw invalid();
        }
        if (value.isBefore(EARLIEST) || value.isAfter(now())) {
            throw invalid();
        }
        return value;
    }

    private static LocalDate date(String text) {
        try {
            LocalDate value = LocalDate.parse(text, DATE);
            if (value.isBefore(EARLIEST_DATE) || value.isAfter(LATEST_DATE)) {
                throw invalid();
            }
            return value;
        } catch (DateTimeParseException e) {
            throw invalid();
        }
    }

    /** DATETIME has no fractions of a second. */
    private LocalDateTime now() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }

    private static BusinessException invalid() {
        return new BusinessException(ErrorCode.INVALID_REQUEST);
    }

    public record NewMeasurement(LocalDateTime measuredAt, MeasurementValues values) {
    }

    public record MeasurementChange(LocalDateTime measuredAt, MeasurementValues values) {

        public boolean isEmpty() {
            return measuredAt == null && values.isEmpty();
        }
    }

    public record ListQuery(LocalDateTime from, LocalDateTime toExclusive, int limit) {
    }
}
