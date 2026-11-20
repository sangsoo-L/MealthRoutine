package com.healthlab.mealthroutine.backend.quiz.domain;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "quiz_questions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QuizQuestion {

    @Id@GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long quizQuestionId;
    private String questionType; // 'multiple_choice' / 'true_false' (DB가 소문자 enum이라 String)
    private String questionText;
    @JdbcTypeCode(SqlTypes.JSON) // RewardRule이랑 같은 방식
    private String options;      // 보기 JSON 문자열 그대로 (OX면 null)
    private String explanation; // 해설 (제출한 뒤에만 보여줌)
    private String topic;
    private String quizAnswer; // DB가 대문자 'O'/'X'라서 enum 대신 String
    // difficulty, created_at은 안 써서 매핑 안 함 (validate는 매핑한 것만 검사)
}
