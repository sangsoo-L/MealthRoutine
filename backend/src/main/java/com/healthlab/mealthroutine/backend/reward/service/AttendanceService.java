package com.healthlab.mealthroutine.backend.reward.service;

import com.healthlab.mealthroutine.backend.reward.domain.Attendance;
import com.healthlab.mealthroutine.backend.reward.repository.AttendanceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;

@Service
@RequiredArgsConstructor
@Transactional
public class AttendanceService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul"); // 서버 위치와 상관없이 한국 날짜

    private final AttendanceRepository attendanceRepository;

    public boolean attend(Long userId){ // true = 오늘 첫 출석
        LocalDate today = LocalDate.now(KST);
        if(attendanceRepository.existsByUserIdAndAttendDate(userId,today))return false; // 이미 출석
        attendanceRepository.save(Attendance.of(userId,today));
        return true;
    }
}
