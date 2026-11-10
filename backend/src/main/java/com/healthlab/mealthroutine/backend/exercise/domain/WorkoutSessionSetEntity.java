package com.healthlab.mealthroutine.backend.exercise.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "workout_session_sets")
@Getter
@Setter
@NoArgsConstructor
public class WorkoutSessionSetEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long workoutSessionSetId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workout_session_exercises_id")
    private WorkoutSessionExerciseEntity sessionExercise;

    private Short setNumber;

    private Short reps;
//  BigDecimal : 느림,기본 타입보다 사용이 조금 불편함
//  장점: 내부적으로 이진수의 근사치를 사용하는 다른 타입과는 달리
//  내부적으로 10진법을 사용해 저장하여 연산결과값이 정확하다.
//  초기화시 숫자가 아닌 문자열로 초기화해야한다
//  오브젝트 타입이므로 ==,+,- 같은 연산부호 사용이 안된다.(코틀린은 연산부호 사용 가능)
//  .equals(),.add() 같은 함수를 사용해야 한다.
    private BigDecimal weightKg;

    private Integer durationSeconds;

    @Column(name = "distance_m")
    private BigDecimal distanceM;

    private Integer restSeconds;
}
