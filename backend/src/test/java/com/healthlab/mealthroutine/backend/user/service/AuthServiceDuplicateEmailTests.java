package com.healthlab.mealthroutine.backend.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.user.dto.SignupRequest;
import com.healthlab.mealthroutine.backend.user.repository.UserProfileRepository;
import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import java.sql.SQLIntegrityConstraintViolationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * No Spring, no DB. Checks the duplicate-email check itself and how AuthService uses it when the
 * user insert fails. This is the path a same-moment duplicate signup takes; it does not run two
 * requests at once (no concurrency test).
 */
class AuthServiceDuplicateEmailTests {

    private UserRepository userRepository;
    private UserProfileRepository userProfileRepository;
    private AuthService authService;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        userProfileRepository = mock(UserProfileRepository.class);
        PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
        given(passwordEncoder.encode(anyString())).willReturn("hashed");
        authService = new AuthService(userRepository, userProfileRepository, passwordEncoder);
        // Both pre-checks pass, as when another request inserts the same email right after them.
        given(userRepository.existsByEmail(anyString())).willReturn(false);
        given(userProfileRepository.existsByDisplayName(anyString())).willReturn(false);
    }

    @Test
    void recognizesMysqlDuplicateOnEmailKey() {
        assertThat(AuthService.isDuplicateEmail(wrap(1062, "Duplicate entry 'a@b.com' for key 'users.email'"))).isTrue();
    }

    @Test
    void ignoresOtherKeysCodesAndMissingCause() {
        assertThat(AuthService.isDuplicateEmail(wrap(1062, "Duplicate entry '7' for key 'users.PRIMARY'"))).isFalse();
        assertThat(AuthService.isDuplicateEmail(wrap(1452, "Cannot add or update a child row: a foreign key constraint fails")))
                .isFalse();
        // The email text itself contains the key phrase, but the key is different.
        assertThat(AuthService.isDuplicateEmail(
                wrap(1062, "Duplicate entry 'for key 'users.email'' for key 'users.other'"))).isFalse();
        assertThat(AuthService.isDuplicateEmail(new DataIntegrityViolationException("no cause"))).isFalse();
    }

    @Test
    void duplicateEmailOnInsertBecomesEmailUnavailable() {
        given(userRepository.saveAndFlush(any())).willThrow(wrap(1062, "Duplicate entry 'a@b.com' for key 'users.email'"));

        assertThatThrownBy(() -> authService.signup(request()))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.EMAIL_UNAVAILABLE);
        verify(userProfileRepository, never()).saveAndFlush(any());
    }

    @Test
    void otherIntegrityErrorKeepsOriginalException() {
        DataIntegrityViolationException original = wrap(1452, "Cannot add or update a child row");
        given(userRepository.saveAndFlush(any())).willThrow(original);

        assertThatThrownBy(() -> authService.signup(request())).isSameAs(original);
        verify(userProfileRepository, never()).saveAndFlush(any());
    }

    private static DataIntegrityViolationException wrap(int errorCode, String message) {
        return new DataIntegrityViolationException("could not execute statement",
                new SQLIntegrityConstraintViolationException(message, "23000", errorCode));
    }

    private static SignupRequest request() {
        return new SignupRequest("a@b.com", "Passw0rd!", "홍길동", "길동이", true);
    }
}
