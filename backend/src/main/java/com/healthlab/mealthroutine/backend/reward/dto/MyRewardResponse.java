package com.healthlab.mealthroutine.backend.reward.dto;

public record MyRewardResponse(
   int level,
   String levelName,
   long totalXp,
   Long nextLevelXp, // 다음 레벨 기준 경험치 (최고 레벨이면 null)
   long balance // 포인트 잔액
) {}
