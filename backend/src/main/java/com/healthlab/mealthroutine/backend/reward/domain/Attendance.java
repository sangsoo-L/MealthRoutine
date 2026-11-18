package com.healthlab.mealthroutine.backend.reward.domain;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Entity
@Table(name="attendances")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Attendance {
    @Id@GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long attendanceId;

    private Long userId;
    private LocalDate attendDate; // 시각 말고 날짜만 (하루 단위)

    public static Attendance of(Long userId , LocalDate date){ // 출석 한건 생성
        Attendance a = new Attendance();
        a.userId = userId;
        a.attendDate = date;
        return a;
    }
}
