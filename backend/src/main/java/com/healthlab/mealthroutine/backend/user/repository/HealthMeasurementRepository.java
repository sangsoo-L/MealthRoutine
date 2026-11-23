package com.healthlab.mealthroutine.backend.user.repository;

import com.healthlab.mealthroutine.backend.user.domain.HealthMeasurement;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface HealthMeasurementRepository extends JpaRepository<HealthMeasurement, Long> {

    /**
     * The member's own record with a row lock (SELECT ... FOR UPDATE) held until the transaction ends (HEALTH8-17).
     * Another member's record and a missing one both come back empty (one 404). Must be the transaction's first
     * read so it sees the latest committed values.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from HealthMeasurement m where m.measurementId = :measurementId and m.user.userId = :userId")
    Optional<HealthMeasurement> findByIdAndUserIdForUpdate(@Param("measurementId") Long measurementId,
            @Param("userId") Long userId);

    /** Newest first: measured_at, then id (HEALTH8-6). from is inclusive, toExclusive is not. */
    @Query("select m from HealthMeasurement m where m.user.userId = :userId"
            + " and m.measuredAt >= :from and m.measuredAt < :toExclusive"
            + " order by m.measuredAt desc, m.measurementId desc")
    List<HealthMeasurement> findForList(@Param("userId") Long userId, @Param("from") LocalDateTime from,
            @Param("toExclusive") LocalDateTime toExclusive, Limit limit);

    /** Latest row that has a height, same order as the list (HEALTH8-7). */
    Optional<HealthMeasurement> findFirstByUserUserIdAndHeightCmIsNotNullOrderByMeasuredAtDescMeasurementIdDesc(
            Long userId);

    /** Latest row that has a weight, same order as the list (HEALTH8-7). */
    Optional<HealthMeasurement> findFirstByUserUserIdAndWeightKgIsNotNullOrderByMeasuredAtDescMeasurementIdDesc(
            Long userId);
}
