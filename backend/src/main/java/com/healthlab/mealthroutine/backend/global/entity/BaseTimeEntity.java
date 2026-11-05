package com.healthlab.mealthroutine.backend.global.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.MappedSuperclass;
import lombok.Getter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@MappedSuperclass // 테이블은 안 만들고, 상속한 엔티티에 컬럼만 물려줌
@EntityListeners(AuditingEntityListener.class) // 저장 , 수정 순간을 감지해서 시간 자동 입력
@Getter
public abstract class BaseTimeEntity {

    @CreatedDate
    @Column(updatable = false) // 처음 저장 후 다시 안 바꿈
    private LocalDateTime createAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;// 수정할 떄마다 갱신
}
