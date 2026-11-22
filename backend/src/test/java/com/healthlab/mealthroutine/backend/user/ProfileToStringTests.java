package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;

import com.healthlab.mealthroutine.backend.user.dto.MeResponse;
import com.healthlab.mealthroutine.backend.user.dto.ProfileResponse;
import com.healthlab.mealthroutine.backend.user.dto.ProfileUpdateRequest;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Personal data (birth date, phone number, email, real name) never shows up if these objects are logged. */
class ProfileToStringTests {

    @Test
    void profileObjectsHideBirthDateAndPhoneNumber() {
        String request = new ProfileUpdateRequest("길동", "1990-05-05", "male", "SEOUL", "advanced", "010-9876-5432",
                List.of("오이")).toString();
        String response = new ProfileResponse("길동", LocalDate.of(1990, 5, 5), "male", "SEOUL", null, "advanced",
                "010-9876-5432", List.of("오이")).toString();

        for (String text : List.of(request, response)) {
            assertThat(text).doesNotContain("1990").doesNotContain("9876").contains("길동");
        }
    }

    @Test
    void meHidesEmailAndRealName() {
        String text = new MeResponse(1L, "secret@example.com", "홍길동", "길동", "user", "active", true, false, false)
                .toString();

        assertThat(text).doesNotContain("secret@example.com").doesNotContain("홍길동").contains("길동");
    }
}
