package com.healthlab.mealthroutine.backend.reward.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.LoginUser;
import com.healthlab.mealthroutine.backend.reward.service.AttendanceService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/attendance")
public class AttendanceController {

    private final AttendanceService attendanceService;

    @PostMapping // 프론트가 메인 화면 들어올 때 호출 -> 이거하면 경험치오름 , true일 때만 "출석 완료!이런거넣으려고 boolean 리턴
    public ApiResponse<Boolean> attend(@LoginUser Long userId){
        return ApiResponse.ok(attendanceService.attend(userId)); // data: true(첫 출석) / false(이미 함)
    }
}
