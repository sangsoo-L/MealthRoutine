package com.healthlab.mealthroutine.backend.quiz.repository;

import com.healthlab.mealthroutine.backend.quiz.domain.QuizAttempt;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;

public interface QuizAttemptRepository extends JpaRepository<QuizAttempt ,Long> {
    Optional<QuizAttempt> findByUserIdAndAttemptDate(Long userId , LocalDate attemptDate);
}
