package com.healthlab.mealthroutine.backend.reward.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.LoginUser;
import com.healthlab.mealthroutine.backend.common.PageResponse;
import com.healthlab.mealthroutine.backend.reward.dto.MyRewardResponse;
import com.healthlab.mealthroutine.backend.reward.dto.PointTransactionResponse;
import com.healthlab.mealthroutine.backend.reward.service.RewardQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/users/me")
public class RewardController {

    private final RewardQueryService rewardQueryService;

    @GetMapping("/rewards")
    public ApiResponse<MyRewardResponse> getMy(@LoginUser Long userId){
        return ApiResponse.ok(rewardQueryService.getMy(userId));
    }

    @GetMapping("/point-transactions")
    public ApiResponse<PageResponse<PointTransactionResponse>> getPoints(
            @LoginUser Long userId, @PageableDefault( size = 20)Pageable pageable){
                return ApiResponse.ok(rewardQueryService.getPointHistory(userId,pageable));
    }

}
