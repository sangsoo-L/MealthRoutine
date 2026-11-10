package com.healthlab.mealthroutine.backend.diet.repository;

import com.healthlab.mealthroutine.backend.diet.domain.MealRecord;
import com.healthlab.mealthroutine.backend.diet.domain.RecordStatus;
import com.healthlab.mealthroutine.backend.diet.domain.RecordType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface MealRecordRepository extends JpaRepository<MealRecord,Long> {

    @EntityGraph(attributePaths = "items")  // 끼니 조회할 때 아이템도 한 번에 가져오기
    @Query("""
           SELECT r FROM MealRecord r
           WHERE r.userId = :userId
             AND r.recordType = :recordType
             AND r.recordStatus <> :deleted
             AND r.mealAt >= :start AND r.mealAt < :end
           ORDER BY r.mealAt
           """)
    // 상태가 DELETED가 아닌 것만
    List<MealRecord> findDaily(@Param("userId")Long userId,
                               @Param("recordType")RecordType recordType,
                               @Param("deleted") RecordStatus deleted,
                               @Param("start")LocalDateTime start, // 그날 00:00
                               @Param("end")LocalDateTime end // 다음날 00:00
                               );
}
