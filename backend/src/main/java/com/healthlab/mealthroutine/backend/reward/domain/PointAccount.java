package com.healthlab.mealthroutine.backend.reward.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name="point_accounts")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PointAccount {

    @Id
    private Long userId;
    private long balance; //포인트 잔액

    public static PointAccount create(Long userId){
        PointAccount a = new PointAccount();
        a.userId = userId;
        a.balance =  0;
        return a;
    }

    // 지급 -> 잔액 증가
    public void earn(int amount){
        this.balance += amount;
    }
}
