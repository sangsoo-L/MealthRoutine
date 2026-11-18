package com.healthlab.mealthroutine.backend.quiz.domain;

import jakarta.persistence.*;

import java.time.LocalDate;

@Entity
@Table(name ="quiz_attempts")
public class QuizAttempt {

    @Id@GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long quizAttemptId;

    private Long userId;
    private Long quizQuestionId;
    private String userGuessQuestions; // 사용자가 낸 답 (O/X)

    @Column(name="is_correct")
    private boolean correct; //getter가 iscorrect()로 만들어짐

    private LocalDate attemptDate; //하루 1회 기준 날짜
    // points_awarded, attempted_at은 DB 기본값이 들어감

    public static QuizAttempt of(Long userId , QuizQuestion q , String answer , LocalDate date){
        QuizAttempt a = new QuizAttempt();
        a.userId = userId;
        a.quizQuestionId = q.getQuizQuestionId();
        a.userGuessQuestions = answer;
        a.correct = q.getQuizAnswer().equals(answer); // 비교해서 채점하는거
        a.attemptDate =date;
        return a;
    }


}
