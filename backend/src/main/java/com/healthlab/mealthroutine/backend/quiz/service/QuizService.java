package com.healthlab.mealthroutine.backend.quiz.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.quiz.domain.QuizAttempt;
import com.healthlab.mealthroutine.backend.quiz.domain.QuizQuestion;
import com.healthlab.mealthroutine.backend.quiz.dto.QuizResultResponse;
import com.healthlab.mealthroutine.backend.quiz.dto.TodayQuizResponse;
import com.healthlab.mealthroutine.backend.quiz.repository.QuizAttemptRepository;
import com.healthlab.mealthroutine.backend.quiz.repository.QuizQuestionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class QuizService {

    private static  final ZoneId KST = ZoneId.of("Asia/Seoul");
    private final QuizQuestionRepository questionRepository;
    private final QuizAttemptRepository attemptRepository;

    public TodayQuizResponse getToday(Long userId){
        LocalDate today = LocalDate.now(KST);
        QuizQuestion q = todayQuestion(today);
        QuizResultResponse result = attemptRepository.findByUserIdAndAttemptDate(userId,today)
                .map(a -> toResult(a.isCorrect(),q)).orElse(null); // 푼 사람만 정답 보여줌
        return new TodayQuizResponse(q.getQuizQuestionId(),q.getQuestionText(),q.getTopic(), result != null , result);
    }

    @Transactional
    public QuizResultResponse submit(Long userId, String answer){
        LocalDate today = LocalDate.now(KST);
        if(attemptRepository.findByUserIdAndAttemptDate(userId,today).isPresent())
            throw new BusinessException(ErrorCode.QUIZ_ALREADY_ATTEMPTED); // 하루 1번
        QuizQuestion q = todayQuestion(today);
        QuizAttempt attempt = attemptRepository.save(QuizAttempt.of(userId,q,answer,today));
        return toResult(attempt.isCorrect(),q);
    }

    private QuizQuestion todayQuestion(LocalDate date){  // 날짜로 문제 고르기
        List<QuizQuestion> all = questionRepository.findAll(Sort.by("quizQuestionId"));
        if(all.isEmpty()) throw new BusinessException(ErrorCode.QUIZ_NOT_FOUND);
        return all.get((int)(date.toEpochDay() % all.size()));  // 같은 날 = 같은 문제, 매일 바뀜
    }

    private QuizResultResponse toResult(boolean correct, QuizQuestion q){
        return new QuizResultResponse(correct,q.getQuizAnswer(),q.getExplanation());
    }

}
