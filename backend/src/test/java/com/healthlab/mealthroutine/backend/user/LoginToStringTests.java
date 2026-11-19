package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;

import com.healthlab.mealthroutine.backend.user.dto.LoginResponse;
import com.healthlab.mealthroutine.backend.user.service.LoginResult;
import org.junit.jupiter.api.Test;

/** Tokens must never appear if these objects are logged (P-01). Plain unit tests, no Spring context. */
class LoginToStringTests {

    private static final String ACCESS_TOKEN = "access-token-value";
    private static final String REFRESH_TOKEN = "refresh-token-value";

    private static LoginResponse response() {
        return new LoginResponse(ACCESS_TOKEN,
                new LoginResponse.UserSummary(1L, "user", "active", false, false), false);
    }

    @Test
    void loginResponseHidesAccessToken() {
        String text = response().toString();

        assertThat(text).doesNotContain(ACCESS_TOKEN).contains("accessToken=(hidden)").contains("userId=1");
    }

    @Test
    void loginResultHidesBothTokens() {
        String text = new LoginResult(response(), REFRESH_TOKEN).toString();

        assertThat(text).doesNotContain(ACCESS_TOKEN).doesNotContain(REFRESH_TOKEN);
    }
}
