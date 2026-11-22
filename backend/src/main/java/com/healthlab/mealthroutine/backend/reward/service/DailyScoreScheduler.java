package com.healthlab.mealthroutine.backend.reward.service;

import com.healthlab.mealthroutine.backend.reward.repository.AttendanceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class DailyScoreScheduler {

    private final AttendanceRepository attendanceRepository;
    private final DailyScoreService dailyScoreService;

    @Scheduled(cron = "0 5 0 * * *" , zone = "Asia/Seoul") // 초 분 시 일 월 요일 매일 00:05
    public void settleYesterday(){
        LocalDate yesterday  = LocalDate.now(ZoneId.of("Asia/Seoul")).minusDays(1);
        List<Long> userIds = attendanceRepository.findUserIdsByDate(yesterday);
        log.info("일일 점수 확정 시작: date={}, 대상={}", yesterday, userIds);   // 매분 찍히는지 확인
        for (Long userId : attendanceRepository.findUserIdsByDate(yesterday)){// 출석한 회원만
            try{
                dailyScoreService.settle(userId,yesterday);
            }catch (Exception e){ // 한 명 실패해도 나머지는 계속
                log.warn("일일 점수 확정 실패 userId={} , date={} ",userId,yesterday,e);
            }
        }
    }

}
