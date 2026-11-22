package com.healthlab.mealthroutine.backend.reward.repository;

import com.healthlab.mealthroutine.backend.reward.domain.Attendance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface AttendanceRepository extends JpaRepository<Attendance,Long> {
    boolean existsByUserIdAndAttendDate(Long userId, LocalDate attendDate); // 그날 출석했는지

    @Query("select a.userId from Attendance a where a.attendDate = :date")
    List<Long> findUserIdsByDate(@Param("date")LocalDate date); // 그날 출석한 회원 ID들
}
