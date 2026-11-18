package com.healthlab.mealthroutine.backend.reward.repository;

import com.healthlab.mealthroutine.backend.reward.domain.Attendance;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;

public interface AttendanceRepository extends JpaRepository<Attendance,Long> {
    boolean existsByUserIdAndAttendDate(Long userId, LocalDate attendDate); // 그날 출석했는지
}
