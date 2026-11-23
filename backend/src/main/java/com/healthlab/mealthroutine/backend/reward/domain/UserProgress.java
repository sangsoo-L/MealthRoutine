package com.healthlab.mealthroutine.backend.reward.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "user_progress")
@Getter@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserProgress {

    @Id // user_id 가 그대로 pk라서 @generatedvalue없음
    private Long userId;
    private long totalXp;
    private int level;
    // updated_at은 db가 자동 갱신해서 필드로 안 만들어도 됨

    public static UserProgress create(Long userId){ // 처음 보상 받는 회원용
        UserProgress p = new UserProgress();
        p.userId = userId;
        p.totalXp = 0;
        p.level = 1;
        return p;
    }

    // 레벨 계산은 밖에서 해서 넘겨줌
    public void addXp(int xp , int newLevel){
        this.totalXp += xp;
        this.level = newLevel;
    }
}
