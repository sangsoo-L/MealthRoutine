package com.healthlab.mealthroutine.backend.quiz.repository;

import com.healthlab.mealthroutine.backend.quiz.domain.QuizQuestion;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuizQuestionRepository extends JpaRepository<QuizQuestion , Long> {
}
