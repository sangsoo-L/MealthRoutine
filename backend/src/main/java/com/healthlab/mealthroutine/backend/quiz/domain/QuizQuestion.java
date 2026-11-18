package com.healthlab.mealthroutine.backend.quiz.domain;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "quiz_questions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QuizQuestion {

    @Id@GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long quizQuestionId;

    private String questionText;
    private String explanation; // 해설 (제출한 뒤에만 보여줌)
    private String topic;
    private String quizAnswer; // DB가 대문자 'O'/'X'라서 enum 대신 String
    // difficulty, created_at은 안 써서 매핑 안 함 (validate는 매핑한 것만 검사)
}
