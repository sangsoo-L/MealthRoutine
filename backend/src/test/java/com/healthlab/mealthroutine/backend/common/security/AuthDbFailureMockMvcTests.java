package com.healthlab.mealthroutine.backend.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * A DB failure while checking the account must stay a server error, never an auth error (plan v3 7).
 * MockMvc has no servlet container, so an exception the filter does not catch comes straight out of perform().
 * That is what this test checks; the real HTTP 500 is checked in AuthDbFailureServerTests.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthDbFailureMockMvcTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @MockitoBean
    private AuthUserLookup authUserLookup;

    @Test
    void dbFailureIsPassedOnNotTurnedInto401() {
        given(authUserLookup.find(anyLong())).willThrow(new DataAccessResourceFailureException("test: db down"));
        String token = jwtTokenProvider.createAccessToken(1L, UserRole.USER, Instant.now());

        Throwable thrown = catchThrowable(() -> mockMvc.perform(
                get("/api/v1/exercise-goals").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)));

        // MockMvc may wrap it in a ServletException; either way the original DB error must be there.
        assertThat(thrown).isNotNull();
        Throwable original = thrown instanceof DataAccessResourceFailureException ? thrown : thrown.getCause();
        assertThat(original).isInstanceOf(DataAccessResourceFailureException.class);
        verify(authUserLookup, times(1)).find(1L);
    }
}
