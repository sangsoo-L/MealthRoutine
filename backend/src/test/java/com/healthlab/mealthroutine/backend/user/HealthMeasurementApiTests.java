package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.jayway.jsonpath.JsonPath;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * Body measurement and health metric APIs (member unit 8, HEALTH8-*) with a movable fixed clock (12:00 in Seoul on
 * 2026-11-23). Every test rolls back; races and real commits are in HealthMeasurementRaceTests. Each test uses its
 * own user ids because the PIN and password attempt limiters count per user for the whole run.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
@ExtendWith(OutputCaptureExtension.class)
class HealthMeasurementApiTests {

    private static final String MEASUREMENTS = "/api/v1/health/measurements";
    private static final String METRICS = "/api/v1/health/metrics";
    private static final String PIN_HEADER = "X-Pin-Token";
    private static final Instant NOW = Instant.parse("2026-11-23T03:00:00Z");
    private static final LocalDateTime NOW_LOCAL = LocalDateTime.of(2026, 11, 23, 12, 0, 0);
    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final Duration PIN_TTL = Duration.ofMinutes(10);
    private static final String PASSWORD = "Passw0rd!";
    private static final String PIN = "482916";
    private static final AtomicLong NEXT_ID = new AtomicLong(9800L);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private EntityManager entityManager;

    @MockitoBean
    private Clock clock;

    private final AtomicReference<Instant> now = new AtomicReference<>(NOW);
    private long userId;
    private long otherUserId;

    @BeforeEach
    void setUp() {
        given(clock.instant()).willAnswer(invocation -> now.get());
        given(clock.getZone()).willReturn(ZONE);
        userId = NEXT_ID.getAndIncrement();
        otherUserId = NEXT_ID.getAndIncrement();
    }

    // ---------- POST (no PIN) ----------

    @Test
    void postNeedsNoPinAndAnswersWithTheIdOnly() throws Exception {
        insertUser(userId, false); // not even a PIN registered

        String body = send(post(MEASUREMENTS), "{\"heightCm\":173.4,\"weightKg\":68.9}", null)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andReturn().getResponse().getContentAsString();

        long id = ((Number) JsonPath.read(body, "$.data.measurementId")).longValue();
        assertThat(body).doesNotContain("173.4").doesNotContain("68.9").doesNotContain("bmi")
                .doesNotContain("heightCm").doesNotContain("weightKg");
        Map<String, Object> row = row(id);
        assertThat(row.get("user_id")).isEqualTo(userId);
        assertThat(row.get("measured_at")).isEqualTo(NOW_LOCAL); // left out → now (DC-05)
        assertThat((BigDecimal) row.get("height_cm")).isEqualByComparingTo("173.4");
        assertThat((BigDecimal) row.get("weight_kg")).isEqualByComparingTo("68.9");
        assertThat(row.get("body_fat_pct")).isNull();
        assertThat(row.get("bmi")).isNull(); // never stored (HEALTH8-A)
        assertThat(row.get("source")).isEqualTo("manual");
        assertThat(row.get("is_estimated")).isEqualTo(false);
    }

    @Test
    void measuredAtLeftOutUsesNowWithoutFractionsOfASecond() throws Exception {
        insertUser(userId, false);
        now.set(NOW.plusMillis(789));

        long id = created(send(post(MEASUREMENTS), "{\"weightKg\":70}", null));
        assertThat(row(id).get("measured_at")).isEqualTo(NOW_LOCAL);
    }

    @Test
    void postAlwaysAddsANewRowAndNeverChangesAnOldOne() throws Exception {
        insertUser(userId, false);
        long first = created(send(post(MEASUREMENTS), "{\"heightCm\":170}", null));
        long second = created(send(post(MEASUREMENTS), "{\"heightCm\":171,\"weightKg\":60}", null));

        assertThat(second).isNotEqualTo(first);
        assertThat(count(userId)).isEqualTo(2);
        assertThat((BigDecimal) row(first).get("height_cm")).isEqualByComparingTo("170");
        assertThat(row(first).get("weight_kg")).isNull();
    }

    @Test
    void postAcceptsTheEdgesOfTheInputRanges() throws Exception {
        insertUser(userId, false);
        String[] bodies = {
            "{\"heightCm\":1}", "{\"heightCm\":300}", "{\"weightKg\":1}", "{\"weightKg\":500}",
            "{\"heightCm\":170.50}", "{\"heightCm\":170.5,\"bodyFatPct\":1,\"skeletalMuscleKg\":1}",
            "{\"weightKg\":60,\"bodyFatPct\":80,\"skeletalMuscleKg\":200}",
            "{\"weightKg\":60,\"measuredAt\":\"2026-11-23T12:00:00\"}", // exactly now
            "{\"weightKg\":60,\"measuredAt\":\"1900-01-01T00:00:00\"}",
            "{\"weightKg\":60,\"measuredAt\":null,\"bodyFatPct\":null}",
        };
        for (String body : bodies) {
            send(post(MEASUREMENTS), body, null).andExpect(status().isCreated());
        }
        assertThat(count(userId)).isEqualTo(bodies.length);
    }

    @Test
    void badPostBodiesAre400AndAddNothing() throws Exception {
        insertUser(userId, false);
        String[] bodies = {
            "{}", "{\"heightCm\":null,\"weightKg\":null}", "{\"bodyFatPct\":20}", "{\"skeletalMuscleKg\":30}",
            "{\"heightCm\":0}", "{\"heightCm\":0.9}", "{\"heightCm\":300.1}", "{\"heightCm\":-170}",
            "{\"heightCm\":170.55}", "{\"heightCm\":\"170\"}", "{\"heightCm\":true}", "{\"heightCm\":1.7e2}",
            "{\"heightCm\":[170]}", "{\"weightKg\":0}", "{\"weightKg\":500.1}",
            "{\"weightKg\":60,\"bodyFatPct\":0.5}", "{\"weightKg\":60,\"bodyFatPct\":80.1}",
            "{\"weightKg\":60,\"skeletalMuscleKg\":200.1}",
            "{\"weightKg\":60,\"measuredAt\":\"\"}", "{\"weightKg\":60,\"measuredAt\":\" \"}",
            "{\"weightKg\":60,\"measuredAt\":\"2026-11-23T12:00:01\"}", // one second in the future
            "{\"weightKg\":60,\"measuredAt\":\"1899-12-31T23:59:59\"}",
            "{\"weightKg\":60,\"measuredAt\":\"2026-11-23T12:00\"}",
            "{\"weightKg\":60,\"measuredAt\":\"2026-11-23 12:00:00\"}",
            "{\"weightKg\":60,\"measuredAt\":\"2026-11-23T03:00:00Z\"}",
            "{\"weightKg\":60,\"measuredAt\":\"2026-02-30T00:00:00\"}",
            "{\"weightKg\":60,\"measuredAt\":20261123}", "{broken", "[]",
            "{\"weightKg\":60,\"measuredAt\":\"+999999999-12-31T23:59:59\"}",
            "{\"weightKg\":60,\"measuredAt\":\"-0001-01-01T00:00:00\"}",
        };
        for (String body : bodies) {
            send(post(MEASUREMENTS), body, null)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));
        }
        mockMvc.perform(post(MEASUREMENTS).header(HttpHeaders.AUTHORIZATION, bearer(userId)))
                .andExpect(status().isBadRequest()); // no body at all
        assertThat(count(userId)).isZero();
    }

    @Test
    void unknownFieldsAreIgnoredAndTheRowIsAlwaysTheCallers() throws Exception {
        insertUser(userId, false);
        insertUser(otherUserId, false);

        long id = created(send(post(MEASUREMENTS),
                "{\"heightCm\":170,\"bmi\":99.99,\"userId\":" + otherUserId + ",\"source\":\"device\"}", null));
        Map<String, Object> row = row(id);
        assertThat(row.get("user_id")).isEqualTo(userId);
        assertThat(row.get("bmi")).isNull();
        assertThat(row.get("source")).isEqualTo("manual");
    }

    @Test
    void everyHealthApiNeedsALogin() throws Exception {
        mockMvc.perform(post(MEASUREMENTS).contentType(MediaType.APPLICATION_JSON).content("{\"heightCm\":170}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get(MEASUREMENTS)).andExpect(status().isUnauthorized());
        mockMvc.perform(patch(MEASUREMENTS + "/1").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get(METRICS)).andExpect(status().isUnauthorized());
    }

    // ---------- PIN check (GET, PATCH, metrics) ----------

    @Test
    void pinRulesForAMemberWithAPin() throws Exception {
        insertUser(userId, true);
        insertUser(otherUserId, true);
        long id = insertMeasurement(userId, NOW_LOCAL.minusDays(1), "170", "60");

        for (Function<String, MockHttpServletRequestBuilder> api : protectedApis(id)) {
            expectPinError(api, null, "PIN_REQUIRED");
            expectPinError(api, "", "PIN_REQUIRED");
            expectPinError(api, "   ", "PIN_REQUIRED");
            expectPinError(api, "not-a-token", "PIN_REQUIRED");
            expectPinError(api, jwtTokenProvider.createAccessToken(userId, UserRole.USER, now.get()), "PIN_REQUIRED");
            expectPinError(api, "Bearer " + pinToken(userId, now.get()), "PIN_REQUIRED");
            expectPinError(api, pinToken(otherUserId, now.get()), "PIN_REQUIRED"); // another member's, still valid
            expectPinError(api, pinToken(userId, now.get().minus(PIN_TTL)), "PIN_EXPIRED"); // exactly at expiry
            expectPinError(api, pinToken(otherUserId, now.get().minus(PIN_TTL).minusSeconds(60)), "PIN_EXPIRED");

            call(api, pinToken(userId, now.get())).andExpect(status().isOk());
            call(api, " " + pinToken(userId, now.get()) + " ").andExpect(status().isOk());
            call(api, pinToken(userId, now.get().minus(PIN_TTL).plusSeconds(1))).andExpect(status().isOk());
        }
    }

    @Test
    void aMemberWithoutAPinIsToldToRegisterWhateverTokenIsSent() throws Exception {
        insertUser(userId, false);
        insertUser(otherUserId, true);
        long id = insertMeasurement(userId, NOW_LOCAL.minusDays(1), "170", "60");

        for (Function<String, MockHttpServletRequestBuilder> api : protectedApis(id)) {
            expectPinError(api, null, "PIN_NOT_REGISTERED");
            expectPinError(api, "not-a-token", "PIN_NOT_REGISTERED");
            expectPinError(api, pinToken(otherUserId, now.get()), "PIN_NOT_REGISTERED");
            expectPinError(api, pinToken(userId, now.get().minus(PIN_TTL)), "PIN_NOT_REGISTERED");
        }
    }

    @Test
    void aPinTokenInAuthorizationIsStillA401() throws Exception {
        insertUser(userId, true);
        mockMvc.perform(get(METRICS).header(HttpHeaders.AUTHORIZATION, "Bearer " + pinToken(userId, now.get())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aSuspendedAccountIsStoppedByTheFilterEvenWithAValidPinToken() throws Exception {
        insertUser(userId, true);
        jdbcTemplate.update("update users set account_status = 'suspended' where user_id = ?", userId);

        call(api -> get(METRICS), pinToken(userId, now.get()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("ACCOUNT_SUSPENDED"));
    }

    /** PIN7-5 for unit 8: a PIN token issued earlier keeps working until it expires, whatever happens meanwhile. */
    @Test
    void anIssuedPinTokenOutlivesPinLockPinChangeRecoveryPasswordChangeAndLogout() throws Exception {
        insertUser(userId, true);
        String pinToken = pinToken(userId, now.get());

        for (int i = 0; i < 5; i++) { // fifth wrong PIN locks the PIN
            send(post("/api/v1/users/me/pin/verify"), "{\"pin\":\"111111\"}", null);
        }
        send(post("/api/v1/users/me/pin/verify"), "{\"pin\":\"" + PIN + "\"}", null)
                .andExpect(jsonPath("$.errorCode").value("PIN_LOCKED"));
        call(api -> get(METRICS), pinToken).andExpect(status().isOk());

        send(patch("/api/v1/users/me/pin"), "{\"newPin\":\"058273\",\"currentPassword\":\"" + PASSWORD + "\"}", null)
                .andExpect(status().isNoContent()); // recovery
        call(api -> get(METRICS), pinToken).andExpect(status().isOk());

        send(patch("/api/v1/users/me/pin"), "{\"newPin\":\"" + PIN + "\",\"currentPin\":\"058273\"}", null)
                .andExpect(status().isNoContent()); // ordinary change
        call(api -> get(METRICS), pinToken).andExpect(status().isOk());

        send(patch("/api/v1/users/me/password"),
                "{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"NewPassw0rd#A\"}", null)
                .andExpect(status().isNoContent());
        call(api -> get(METRICS), pinToken).andExpect(status().isOk()); // the access token also stays (AUTH2-2)

        mockMvc.perform(post("/api/v1/auth/logout").header("X-Requested-With", "XMLHttpRequest"))
                .andExpect(status().isNoContent());
        call(api -> get(METRICS), pinToken).andExpect(status().isOk());
    }

    // ---------- order: 400 → PIN 403 → 404 ----------

    @Test
    void inputErrorsComeBeforeThePinCheckAndNotFoundComesAfterIt() throws Exception {
        insertUser(userId, true);
        insertUser(otherUserId, true);
        long others = insertMeasurement(otherUserId, NOW_LOCAL.minusDays(1), "180", "80");

        // 400 with no PIN token at all
        call(api -> get(MEASUREMENTS + "?from=2026-11-10&to=2026-11-01"), null).andExpect(status().isBadRequest());
        call(api -> get(MEASUREMENTS + "?limit=0"), null).andExpect(status().isBadRequest());
        call(api -> get(MEASUREMENTS + "?limit=abc"), null).andExpect(status().isBadRequest());
        call(api -> get(MEASUREMENTS).param("to", "+999999999-12-31"), null)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));
        sendPatch(others, "{\"measuredAt\":\"2026-11-24T00:00:00\"}", null).andExpect(status().isBadRequest());
        sendPatch(others, "{\"measuredAt\":\"\"}", null).andExpect(status().isBadRequest());
        sendPatch(others, "{\"heightCm\":\"180\"}", null).andExpect(status().isBadRequest());
        call(api -> patch(MEASUREMENTS + "/abc").contentType(MediaType.APPLICATION_JSON).content("{}"), null)
                .andExpect(status().isBadRequest());

        // someone else's record: 403 without a PIN token (its existence is not revealed), 404 with one
        sendPatch(others, "{\"weightKg\":81}", null)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.errorCode").value("PIN_REQUIRED"));
        sendPatch(others, "{\"weightKg\":81}", pinToken(userId, now.get()))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.errorCode").value("MEASUREMENT_NOT_FOUND"));
        sendPatch(999_999_999L, "{\"weightKg\":81}", pinToken(userId, now.get()))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.errorCode").value("MEASUREMENT_NOT_FOUND"));
        assertThat((BigDecimal) row(others).get("weight_kg")).isEqualByComparingTo("80");
    }

    // ---------- GET list ----------

    @Test
    void theListShowsOnlyTheCallersRowsNewestFirstWithBmiOnlyWhenARowHasBoth() throws Exception {
        insertUser(userId, true);
        insertUser(otherUserId, true);
        LocalDateTime t = NOW_LOCAL.minusDays(3);
        long heightOnly = insertMeasurement(userId, t, "175", null);
        long both = insertMeasurement(userId, t.plusDays(1), "175", "70");
        long sameTimeLowerId = insertMeasurement(userId, t.plusDays(2), null, "71");
        long sameTimeHigherId = insertMeasurement(userId, t.plusDays(2), null, "72");
        insertMeasurement(otherUserId, t.plusDays(1), "160", "50");
        jdbcTemplate.update("update health_measurements set body_fat_pct = 21.5, skeletal_muscle_kg = 30"
                + " where measurement_id = ?", both);

        String body = call(api -> get(MEASUREMENTS), pinToken(userId, now.get()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        List<Number> ids = JsonPath.read(body, "$.data.items[*].measurementId");
        assertThat(ids.stream().map(Number::longValue))
                .containsExactly(sameTimeHigherId, sameTimeLowerId, both, heightOnly);
        assertThat(body).contains("\"measurementId\":" + both + ",\"measuredAt\":\"2026-11-21T12:00:00\","
                + "\"heightCm\":175.00,\"weightKg\":70.00,\"bodyFatPct\":21.50,\"skeletalMuscleKg\":30.00,"
                + "\"bmi\":22.86}");
        assertThat(body).contains("\"measurementId\":" + heightOnly + ",\"measuredAt\":\"2026-11-20T12:00:00\","
                + "\"heightCm\":175.00,\"weightKg\":null,\"bodyFatPct\":null,\"skeletalMuscleKg\":null,"
                + "\"bmi\":null}");
    }

    @Test
    void anEmptyListIsAnEmptyArray() throws Exception {
        insertUser(userId, true);
        call(api -> get(MEASUREMENTS), pinToken(userId, now.get()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items").isArray())
                .andExpect(jsonPath("$.data.items.length()").value(0));
    }

    @Test
    void fromAndToAreDatesWithBothEndsIncluded() throws Exception {
        insertUser(userId, true);
        long before = insertMeasurement(userId, LocalDateTime.of(2026, 10, 31, 23, 59, 59), "170", null);
        long firstDay = insertMeasurement(userId, LocalDateTime.of(2026, 11, 1, 0, 0, 0), "170", null);
        long lastDay = insertMeasurement(userId, LocalDateTime.of(2026, 11, 10, 23, 59, 59), "170", null);
        long after = insertMeasurement(userId, LocalDateTime.of(2026, 11, 11, 0, 0, 0), "170", null);

        assertThat(listIds("?from=2026-11-01&to=2026-11-10")).containsExactly(lastDay, firstDay);
        assertThat(listIds("?from=2026-11-01")).containsExactly(after, lastDay, firstDay);
        assertThat(listIds("?to=2026-11-10")).containsExactly(lastDay, firstDay, before);
        assertThat(listIds("?from=2026-11-10&to=2026-11-10")).containsExactly(lastDay);
        assertThat(listIds("?to=9999-12-31")).hasSize(4);
        for (String bad : new String[] {"?from=2026-1-1", "?from=2026-11-31", "?to=", "?from=1899-12-31",
                "?from=2026-11-01T00:00:00", "?limit=101", "?limit=-1"}) {
            call(api -> get(MEASUREMENTS + bad), pinToken(userId, now.get())).andExpect(status().isBadRequest());
        }
    }

    /**
     * The date pattern also reads years with more than four digits. Anything after 9999-12-31 must be a 400, not an
     * overflow (500) when the end of the range is worked out (Codex code review P2). Sent with param() so the "+"
     * reaches the server as it is.
     */
    @Test
    void datesAfterYear9999Are400NotAServerError() throws Exception {
        insertUser(userId, true);
        String[][] params = {
            {"to", "+999999999-12-31"}, {"from", "+999999999-12-31"}, {"to", "+10000-01-01"},
            {"from", "+10000-01-01"}, {"from", "-0001-01-01"},
        };
        for (String[] param : params) {
            call(api -> get(MEASUREMENTS).param(param[0], param[1]), pinToken(userId, now.get()))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));
        }
        call(api -> get(MEASUREMENTS).param("to", "9999-12-31"), pinToken(userId, now.get()))
                .andExpect(status().isOk()); // the last accepted day still works
    }

    @Test
    void limitIs30ByDefaultAndAtMost100() throws Exception {
        insertUser(userId, true);
        for (int i = 0; i < 31; i++) {
            insertMeasurement(userId, NOW_LOCAL.minusMinutes(i), "170", null);
        }
        assertThat(listIds("")).hasSize(30);
        assertThat(listIds("?limit=1")).hasSize(1);
        assertThat(listIds("?limit=100")).hasSize(31);
    }

    // ---------- PATCH ----------

    @Test
    void patchChangesOnlyTheGivenFieldsAndAnswersWithTheRow() throws Exception {
        insertUser(userId, true);
        long id = insertMeasurement(userId, NOW_LOCAL.minusDays(1), "170", "60");
        jdbcTemplate.update("update health_measurements set body_fat_pct = 20, skeletal_muscle_kg = 30"
                + " where measurement_id = ?", id);

        String body = sendPatch(id, "{\"weightKg\":61.5,\"heightCm\":null}", pinToken(userId, now.get()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(body).contains("\"heightCm\":170.00,\"weightKg\":61.50,\"bodyFatPct\":20.00,"
                + "\"skeletalMuscleKg\":30.00,\"bmi\":21.28}");
        Map<String, Object> row = flushedRow(id);
        assertThat((BigDecimal) row.get("height_cm")).isEqualByComparingTo("170");
        assertThat((BigDecimal) row.get("weight_kg")).isEqualByComparingTo("61.5");
        assertThat((BigDecimal) row.get("body_fat_pct")).isEqualByComparingTo("20");
        assertThat(row.get("measured_at")).isEqualTo(NOW_LOCAL.minusDays(1));
        assertThat(row.get("bmi")).isNull();

        sendPatch(id, "{\"measuredAt\":\"2026-11-20T08:30:00\",\"bodyFatPct\":19.5,\"skeletalMuscleKg\":31}",
                pinToken(userId, now.get())).andExpect(status().isOk());
        row = flushedRow(id);
        assertThat(row.get("measured_at")).isEqualTo(LocalDateTime.of(2026, 11, 20, 8, 30, 0));
        assertThat((BigDecimal) row.get("body_fat_pct")).isEqualByComparingTo("19.5");
        assertThat((BigDecimal) row.get("weight_kg")).isEqualByComparingTo("61.5");
    }

    @Test
    void anEmptyPatchAnswersWithTheCurrentRowAndChangesNothing() throws Exception {
        insertUser(userId, true);
        long id = insertMeasurement(userId, NOW_LOCAL.minusDays(1), "170", null);
        Map<String, Object> before = row(id);

        for (String body : new String[] {"{}", "{\"heightCm\":null,\"weightKg\":null,\"measuredAt\":null}",
                "{\"unknown\":1}"}) {
            sendPatch(id, body, pinToken(userId, now.get()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.measurementId").value(id))
                    .andExpect(jsonPath("$.data.weightKg").doesNotExist()) // null value
                    .andExpect(jsonPath("$.data.bmi").doesNotExist());
            assertThat(flushedRow(id)).isEqualTo(before);
        }
    }

    @Test
    void badPatchValuesAre400AndChangeNothing() throws Exception {
        insertUser(userId, true);
        long id = insertMeasurement(userId, NOW_LOCAL.minusDays(1), "170", "60");
        Map<String, Object> before = row(id);
        for (String body : new String[] {"{\"heightCm\":0}", "{\"weightKg\":500.1}", "{\"weightKg\":60.25}",
                "{\"measuredAt\":\"\"}", "{\"measuredAt\":\"2026-11-23T12:00:01\"}", "{\"bodyFatPct\":\"20\"}",
                "{broken"}) {
            sendPatch(id, body, pinToken(userId, now.get())).andExpect(status().isBadRequest());
            assertThat(flushedRow(id)).isEqualTo(before);
        }
    }

    // ---------- metrics ----------

    @Test
    void metricsUseTheLatestHeightAndTheLatestWeightEachFromItsOwnRow() throws Exception {
        insertUser(userId, true);
        insertProfile(userId, LocalDate.of(2001, 11, 23), "male", "beginner"); // 25 today
        LocalDateTime t = NOW_LOCAL.minusDays(5);
        insertMeasurement(userId, t, "160", "90");               // older height and weight
        insertMeasurement(userId, t.plusDays(1), "175", null);   // latest height
        insertMeasurement(userId, t.plusDays(2), null, "70");    // latest weight

        String body = call(api -> get(METRICS), pinToken(userId, now.get()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(body).contains("\"data\":{\"basedOn\":{\"heightCm\":175.00,\"heightMeasuredAt\":"
                + "\"2026-11-19T12:00:00\",\"weightKg\":70.00,\"weightMeasuredAt\":\"2026-11-20T12:00:00\"},"
                + "\"bmi\":22.86,\"bmr\":1674,\"activityFactor\":1.375,\"tdee\":2301,"
                + "\"formula\":\"Mifflin-St Jeor\",\"isEstimated\":true,\"missingFields\":[],"
                + "\"notCalculableFields\":[]}");
    }

    @Test
    void forTheSameMeasuredAtTheHigherIdIsTheLatest() throws Exception {
        insertUser(userId, true);
        LocalDateTime t = NOW_LOCAL.minusDays(1);
        insertMeasurement(userId, t, "170", null);
        insertMeasurement(userId, t, "180", null);
        insertMeasurement(userId, t.minusDays(1), "190", null); // higher id but measured earlier

        call(api -> get(METRICS), pinToken(userId, now.get()))
                .andExpect(jsonPath("$.data.basedOn.heightCm").value(180.0));
    }

    @Test
    void withNothingRecordedEveryValueIsNullAndAllInputsAreMissing() throws Exception {
        insertUser(userId, true);

        String body = call(api -> get(METRICS), pinToken(userId, now.get()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(body).contains("\"basedOn\":{\"heightCm\":null,\"heightMeasuredAt\":null,\"weightKg\":null,"
                + "\"weightMeasuredAt\":null},\"bmi\":null,\"bmr\":null,\"activityFactor\":1.2,\"tdee\":null,"
                + "\"formula\":\"Mifflin-St Jeor\",\"isEstimated\":true,"
                + "\"missingFields\":[\"heightCm\",\"weightKg\",\"birthDate\",\"gender\"],\"notCalculableFields\":[]");
    }

    @Test
    void withoutAProfileOnlyBmiIsCalculated() throws Exception {
        insertUser(userId, true);
        insertMeasurement(userId, NOW_LOCAL.minusDays(1), "175", "70");

        call(api -> get(METRICS), pinToken(userId, now.get()))
                .andExpect(jsonPath("$.data.bmi").value(22.86))
                .andExpect(jsonPath("$.data.bmr").doesNotExist())
                .andExpect(jsonPath("$.data.activityFactor").value(1.2))
                .andExpect(jsonPath("$.data.missingFields").value(org.hamcrest.Matchers.contains("birthDate",
                        "gender")));
    }

    @Test
    void aBmrOfZeroOrLessIsListedAsNotCalculableAndASmallPositiveOneIsZero() throws Exception {
        insertUser(userId, true);
        insertProfile(userId, LocalDate.of(2001, 11, 23), "male", "beginner");
        long id = insertMeasurement(userId, NOW_LOCAL.minusDays(1), "1", "1");

        call(api -> get(METRICS), pinToken(userId, now.get()))
                .andExpect(jsonPath("$.data.bmr").doesNotExist())
                .andExpect(jsonPath("$.data.tdee").doesNotExist())
                .andExpect(jsonPath("$.data.bmi").value(10000.0))
                .andExpect(jsonPath("$.data.missingFields.length()").value(0))
                .andExpect(jsonPath("$.data.notCalculableFields").value(org.hamcrest.Matchers.contains("bmr",
                        "tdee")));

        // The whole test is one transaction, so the row read above stays in the JPA session; clear it after each
        // SQL change (a real request always starts with an empty session).
        jdbcTemplate.update("update health_measurements set height_cm = 17.6 where measurement_id = ?", id);
        entityManager.clear();
        call(api -> get(METRICS), pinToken(userId, now.get()))
                .andExpect(jsonPath("$.data.basedOn.heightCm").value(17.6))
                .andExpect(jsonPath("$.data.bmr").doesNotExist())
                .andExpect(jsonPath("$.data.notCalculableFields.length()").value(2));

        jdbcTemplate.update("update health_measurements set height_cm = 15.7, weight_kg = 2.2"
                + " where measurement_id = ?", id);
        entityManager.clear();
        String body = call(api -> get(METRICS), pinToken(userId, now.get()))
                .andReturn().getResponse().getContentAsString();
        assertThat(body).contains("\"bmr\":0,").contains("\"tdee\":0,").contains("\"notCalculableFields\":[]");
    }

    // ---------- logs ----------

    @Test
    void noBodyValueOrTokenReachesTheLog(CapturedOutput output) throws Exception {
        insertUser(userId, true);
        insertProfile(userId, LocalDate.of(1990, 5, 17), "female", "advanced");
        String pinToken = pinToken(userId, now.get());
        // MockMvc prints a failed test's request to the console, so only this test's output counts.
        int start = output.getAll().length();

        long id = created(send(post(MEASUREMENTS), "{\"heightCm\":173.4,\"weightKg\":68.9,\"bodyFatPct\":23.7}",
                null));
        sendPatch(id, "{\"weightKg\":67.3}", pinToken).andExpect(status().isOk());
        call(api -> get(MEASUREMENTS), pinToken).andExpect(status().isOk());
        call(api -> get(METRICS), pinToken).andExpect(status().isOk());
        call(api -> get(METRICS), "forged").andExpect(status().isForbidden());

        assertThat(output.getAll().substring(start))
                .contains("Body measurement added: userId=" + userId)
                .contains("Body measurement changed: userId=" + userId)
                .doesNotContain("173.4").doesNotContain("68.9").doesNotContain("23.7").doesNotContain("67.3")
                .doesNotContain(pinToken).doesNotContain("1990-05-17");
    }

    // ---------- helpers ----------

    private List<Function<String, MockHttpServletRequestBuilder>> protectedApis(long measurementId) {
        return List.of(
                token -> get(MEASUREMENTS),
                token -> patch(MEASUREMENTS + "/" + measurementId).contentType(MediaType.APPLICATION_JSON)
                        .content("{}"),
                token -> get(METRICS));
    }

    private void expectPinError(Function<String, MockHttpServletRequestBuilder> api, String pinToken,
            String errorCode) throws Exception {
        call(api, pinToken)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value(errorCode))
                .andExpect(jsonPath("$.data").doesNotExist())
                .andExpect(header().doesNotExist(HttpHeaders.WWW_AUTHENTICATE));
    }

    private ResultActions call(Function<String, MockHttpServletRequestBuilder> api, String pinToken)
            throws Exception {
        MockHttpServletRequestBuilder request = api.apply(pinToken).header(HttpHeaders.AUTHORIZATION, bearer(userId));
        if (pinToken != null) {
            request.header(PIN_HEADER, pinToken);
        }
        return mockMvc.perform(request);
    }

    private ResultActions send(MockHttpServletRequestBuilder request, String body, String pinToken)
            throws Exception {
        request.header(HttpHeaders.AUTHORIZATION, bearer(userId)).contentType(MediaType.APPLICATION_JSON)
                .content(body);
        if (pinToken != null) {
            request.header(PIN_HEADER, pinToken);
        }
        return mockMvc.perform(request);
    }

    private ResultActions sendPatch(long measurementId, String body, String pinToken) throws Exception {
        return send(patch(MEASUREMENTS + "/" + measurementId), body, pinToken);
    }

    private long created(ResultActions result) throws Exception {
        String body = result.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(body, "$.data.measurementId")).longValue();
    }

    private List<Long> listIds(String query) throws Exception {
        String body = call(api -> get(MEASUREMENTS + query), pinToken(userId, now.get()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<Number> ids = JsonPath.read(body, "$.data.items[*].measurementId");
        return ids.stream().map(Number::longValue).toList();
    }

    private String bearer(long id) {
        return "Bearer " + jwtTokenProvider.createAccessToken(id, UserRole.USER, now.get());
    }

    private String pinToken(long id, Instant issuedAt) {
        return jwtTokenProvider.createPinToken(id, issuedAt);
    }

    private void insertUser(long id, boolean withPin) {
        jdbcTemplate.update("insert into users (user_id, email, username, password_hash, account_status,"
                + " is_agreed_term, pin_hash) values (?, ?, '신체회원', ?, 'active', true, ?)",
                id, "health" + id + "@example.com", passwordEncoder.encode(PASSWORD),
                withPin ? passwordEncoder.encode(PIN) : null);
    }

    private void insertProfile(long id, LocalDate birthDate, String gender, String level) {
        jdbcTemplate.update("insert into user_profiles (user_id, display_name, birth_date, gender, exercise_level)"
                + " values (?, ?, ?, ?, ?)", id, "health" + id, birthDate, gender, level);
    }

    private long insertMeasurement(long id, LocalDateTime measuredAt, String heightCm, String weightKg) {
        jdbcTemplate.update("insert into health_measurements (user_id, measured_at, height_cm, weight_kg)"
                + " values (?, ?, ?, ?)", id, measuredAt, heightCm == null ? null : new BigDecimal(heightCm),
                weightKg == null ? null : new BigDecimal(weightKg));
        return jdbcTemplate.queryForObject("select last_insert_id()", Long.class);
    }

    private Map<String, Object> row(long measurementId) {
        return jdbcTemplate.queryForMap("select * from health_measurements where measurement_id = ?",
                measurementId);
    }

    /** PATCH changes sit in the JPA session of this test's transaction until flushed. */
    private Map<String, Object> flushedRow(long measurementId) {
        entityManager.flush();
        return row(measurementId);
    }

    private int count(long id) {
        entityManager.flush();
        return jdbcTemplate.queryForObject("select count(*) from health_measurements where user_id = ?",
                Integer.class, id);
    }
}
