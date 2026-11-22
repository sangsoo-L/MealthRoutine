package com.healthlab.mealthroutine.backend.reward.service;

import org.springframework.stereotype.Component;

@Component
public class DietScoreCalculator {

    private static final double[] KCAL_RANGE = {0.10 , 0.20, 0.30}; // 목표 대비 오차 +- 10%목표 대비 오차 ±10%, 20%, 30%
    private static final int[] KCAL_POINT ={30, 20 ,10}; // 그 안이면 받는 점수
    private static final double[] MACRO_RANGE = {0.15 , 0.30}; // 탄단지 오차 +-15% , 30%
    private static final int[] MACRO_POINT = {10 ,5};

    public int calories(double actual , double target){ // 칼로리 점수 (최대 30)
        return score(actual,target,KCAL_RANGE,KCAL_POINT);
    }

    public int macro(double actual, double target){ // 탄/단/지 하나 점수 (최대 10)
        return score(actual,target,MACRO_RANGE,MACRO_POINT);
    }

    public int score(double actual , double target , double[] ranges, int[] points){
        if (target <= 0) return 0; // 목표가 없으면 0점
        double diff = Math.abs(actual - target) / target; // 오차 비율 (예: 1800/2000 → 0.10)
        for(int i = 0; i < ranges.length ; i++){
            if(diff <= ranges[i])return points[i]; // 좁은 범위부터 확인
        }
        return 0;  // 30% 넘게 벗어나면 0점
    }
}
