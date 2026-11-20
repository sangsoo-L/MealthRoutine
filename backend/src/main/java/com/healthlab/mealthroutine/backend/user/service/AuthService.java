package com.healthlab.mealthroutine.backend.user.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.user.domain.User;
import com.healthlab.mealthroutine.backend.user.domain.UserProfile;
import com.healthlab.mealthroutine.backend.user.dto.SignupRequest;
import com.healthlab.mealthroutine.backend.user.dto.SignupResponse;
import com.healthlab.mealthroutine.backend.user.repository.UserProfileRepository;
import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import java.sql.SQLException;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final UserProfileRepository userProfileRepository;
    private final PasswordEncoder passwordEncoder;

    /** Saves the user and the profile together: if the profile fails, the user row is rolled back too. */
    @Transactional
    public SignupResponse signup(SignupRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new BusinessException(ErrorCode.EMAIL_UNAVAILABLE);
        }
        // Checked in code only; the column has no UNIQUE, so two signups at the same moment can still collide (NICK-1).
        if (userProfileRepository.existsByDisplayName(request.nickname())) {
            throw new BusinessException(ErrorCode.NICKNAME_ALREADY_EXISTS);
        }

        User user = User.createLocal(request.email(), request.username(), passwordEncoder.encode(request.password()));
        try {
            // Flush now so a same-moment duplicate email (DB UNIQUE) is reported here, not at commit.
            userRepository.saveAndFlush(user);
        } catch (DataIntegrityViolationException e) {
            // Only the email UNIQUE key becomes EMAIL_UNAVAILABLE. Any other integrity error keeps its own
            // exception (handled as DATA_CONFLICT). The email is not re-queried: this transaction already failed.
            if (isDuplicateEmail(e)) {
                throw new BusinessException(ErrorCode.EMAIL_UNAVAILABLE);
            }
            throw e;
        }
        userProfileRepository.saveAndFlush(new UserProfile(user, request.nickname()));
        return new SignupResponse(user.getUserId());
    }

    private static final int MYSQL_DUPLICATE_ENTRY = 1062;
    private static final String EMAIL_KEY = "for key 'users.email'";

    /**
     * True when the cause is MySQL error 1062 on the users.email UNIQUE key,
     * e.g. "Duplicate entry 'a@b.com' for key 'users.email'". Relies on the key name in the team SQL.
     */
    static boolean isDuplicateEmail(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql) {
                String message = sql.getMessage();
                return sql.getErrorCode() == MYSQL_DUPLICATE_ENTRY && message != null && message.endsWith(EMAIL_KEY);
            }
        }
        return false;
    }
}
