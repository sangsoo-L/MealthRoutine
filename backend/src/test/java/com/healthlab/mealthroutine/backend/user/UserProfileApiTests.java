package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/**
 * GET /api/v1/users/me, GET/PATCH /api/v1/users/me/profile (member unit 4, PROFILE4-1~8) with a fixed "now".
 * Every test rolls back. Rows are checked with SQL, not through JPA, so the values are what MySQL really holds.
 * {@link #perform} clears the JPA cache first so each request reads the DB as the test left it.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class UserProfileApiTests {

    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final Instant NOW = Instant.parse("2026-11-23T03:00:00Z");
    private static final LocalDateTime NOW_LOCAL = LocalDateTime.ofInstant(NOW, ZONE);
    private static final LocalDate TODAY = NOW_LOCAL.toLocalDate();
    private static final LocalDateTime OLD = LocalDateTime.of(2020, 1, 1, 0, 0);
    private static final String ME = "/api/v1/users/me";
    private static final String PROFILE = "/api/v1/users/me/profile";
    private static final String ERROR_CODE = "$.errorCode";
    private static final long A = 9401L;
    private static final long B = 9402L;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private Clock clock;

    @BeforeEach
    void setUp() {
        given(clock.instant()).willReturn(NOW);
        given(clock.getZone()).willReturn(ZONE);
        insertUser(A, "a@example.com", "$2a$10$hash", null);
        insertUser(B, "b@example.com", "$2a$10$hash", null);
    }

    // ---------- GET /users/me ----------

    @Test
    void meShowsTheLoggedInUser() throws Exception {
        insertProfile(A, "길동이");

        perform(get(ME).header(HttpHeaders.AUTHORIZATION, bearer(A)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.userId").value(A))
                .andExpect(jsonPath("$.data.email").value("a@example.com"))
                .andExpect(jsonPath("$.data.username").value("실명" + A))
                .andExpect(jsonPath("$.data.nickname").value("길동이"))
                .andExpect(jsonPath("$.data.role").value("user"))
                .andExpect(jsonPath("$.data.accountStatus").value("active"))
                .andExpect(jsonPath("$.data.passwordSet").value(true))
                .andExpect(jsonPath("$.data.pinRegistered").value(false))
                .andExpect(jsonPath("$.data.onboardingCompleted").value(false))
                .andExpect(jsonPath("$.data.displayName").doesNotExist());
    }

    @Test
    void meForASocialStyleUserWithPinAndNoProfileRow() throws Exception {
        jdbcTemplate.update("update users set password_hash = null, pin_hash = 'pin-hash' where user_id = ?", A);

        perform(get(ME).header(HttpHeaders.AUTHORIZATION, bearer(A)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.passwordSet").value(false))
                .andExpect(jsonPath("$.data.pinRegistered").value(true))
                .andExpect(jsonPath("$.data.nickname").value(nullValue()));
    }

    @Test
    void onboardingStaysFalseEvenWithAFullProfile() throws Exception {
        patchProfile(A, "{\"birthDate\":\"1990-05-05\",\"gender\":\"male\",\"exerciseLevel\":\"advanced\"}")
                .andExpect(status().isOk());

        perform(get(ME).header(HttpHeaders.AUTHORIZATION, bearer(A)))
                .andExpect(jsonPath("$.data.onboardingCompleted").value(false)); // PROFILE4-2
    }

    @Test
    void meAndProfileNeedLogin() throws Exception {
        perform(get(ME)).andExpect(status().isUnauthorized()).andExpect(jsonPath(ERROR_CODE).value("LOGIN_REQUIRED"));
        perform(get(PROFILE)).andExpect(status().isUnauthorized());
        perform(patch(PROFILE).contentType(MediaType.APPLICATION_JSON).content("{\"displayName\":\"길동\"}"))
                .andExpect(status().isUnauthorized());
    }

    // ---------- GET /users/me/profile ----------

    @Test
    void profileRightAfterSignupHasDefaults() throws Exception {
        insertProfile(A, "길동이");

        perform(get(PROFILE).header(HttpHeaders.AUTHORIZATION, bearer(A)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.displayName").value("길동이"))
                .andExpect(jsonPath("$.data.exerciseLevel").value("undecided"))
                .andExpect(jsonPath("$.data.dietaryPreferences").isArray())
                .andExpect(jsonPath("$.data.dietaryPreferences").isEmpty())
                .andExpect(jsonPath("$.data.profileImageUrl").value(nullValue()))
                .andExpect(jsonPath("$.data.birthDate").value(nullValue()))
                .andExpect(jsonPath("$.data.nickname").doesNotExist());
    }

    @Test
    void profileWithoutARowReturnsDefaultsAndSavesNothing() throws Exception {
        perform(get(PROFILE).header(HttpHeaders.AUTHORIZATION, bearer(A)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.displayName").value(nullValue()))
                .andExpect(jsonPath("$.data.exerciseLevel").value("undecided"))
                .andExpect(jsonPath("$.data.dietaryPreferences").isEmpty());

        assertThat(count("user_profiles", A)).isZero();
        assertThat(count("user_health_preferences", A)).isZero();
    }

    // ---------- PATCH: basic changes ----------

    @Test
    void patchChangesOnlyTheFieldsSent() throws Exception {
        insertProfile(A, "길동이");
        jdbcTemplate.update("update user_profiles set birth_date = '1990-01-01', gender = 'female', region_code = 'SEOUL',"
                + " phone_number = '010-1234-5678', exercise_level = 'beginner' where user_id = ?", A);

        patchProfile(A, "{\"displayName\":\"새닉네임\",\"exerciseLevel\":\"advanced\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.displayName").value("새닉네임"))
                .andExpect(jsonPath("$.data.exerciseLevel").value("advanced"))
                .andExpect(jsonPath("$.data.birthDate").value("1990-01-01"))
                .andExpect(jsonPath("$.data.gender").value("female"));

        Map<String, Object> row = profileRow(A);
        assertThat(row.get("display_name")).isEqualTo("새닉네임");
        assertThat(row.get("exercise_level")).isEqualTo("advanced");
        assertThat(row.get("birth_date").toString()).isEqualTo("1990-01-01");
        assertThat(row.get("gender")).isEqualTo("female");
        assertThat(row.get("region_code")).isEqualTo("SEOUL");
        assertThat(row.get("phone_number")).isEqualTo("010-1234-5678");
    }

    @Test
    void nullOrMissingKeepsTheValueAndEmptyClearsIt() throws Exception {
        insertProfile(A, "길동이");
        jdbcTemplate.update("update user_profiles set region_code = 'SEOUL', phone_number = '01012345678',"
                + " gender = 'male', birth_date = '1990-01-01' where user_id = ?", A);
        insertPreferences(A, "[\"오이\"]");

        // null and missing: nothing changes.
        patchProfile(A, "{\"displayName\":null,\"regionCode\":null,\"phoneNumber\":null,\"gender\":null,"
                + "\"birthDate\":null,\"exerciseLevel\":null,\"dietaryPreferences\":null,\"unrelated\":1}")
                .andExpect(status().isOk());
        assertThat(profileRow(A).get("region_code")).isEqualTo("SEOUL");
        assertThat(profileRow(A).get("phone_number")).isEqualTo("01012345678");
        assertThat(profileRow(A).get("display_name")).isEqualTo("길동이");
        assertThat(foods(A)).containsExactly("오이");

        // "" and []: cleared. phoneNumber "" is a delete, not a format error.
        patchProfile(A, "{\"regionCode\":\"\",\"phoneNumber\":\"\",\"dietaryPreferences\":[]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.regionCode").value(nullValue()))
                .andExpect(jsonPath("$.data.phoneNumber").value(nullValue()))
                .andExpect(jsonPath("$.data.dietaryPreferences").isEmpty());
        assertThat(profileRow(A).get("region_code")).isNull();
        assertThat(profileRow(A).get("phone_number")).isNull();
        assertThat(foods(A)).isEmpty();
        assertThat(profileRow(A).get("gender")).isEqualTo("male");
    }

    @Test
    void profileImageUrlInTheRequestIsIgnored() throws Exception {
        insertProfile(A, "길동이");
        jdbcTemplate.update("update user_profiles set profile_image_url = 'https://img/a.png' where user_id = ?", A);

        patchProfile(A, "{\"profileImageUrl\":\"https://evil/x.png\",\"displayName\":\"길동삼\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.profileImageUrl").value("https://img/a.png"));
        assertThat(profileRow(A).get("profile_image_url")).isEqualTo("https://img/a.png");
        assertThat(profileRow(A).get("display_name")).isEqualTo("길동삼");
    }

    @Test
    void dietaryPreferencesAreTrimmedAndDeduplicatedAndCreateTheRow() throws Exception {
        insertProfile(A, "길동이");

        patchProfile(A, "{\"dietaryPreferences\":[\" 오이 \",\"고수\",\"오이\",\"고수 \"]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dietaryPreferences.length()").value(2));

        assertThat(foods(A)).containsExactly("오이", "고수");
        assertThat(preferenceUpdatedAt(A)).isEqualTo(NOW_LOCAL);
    }

    // ---------- PATCH: nickname (PROFILE4-5, NAME-2) ----------

    @ParameterizedTest
    @ValueSource(strings = {"길동", "가나다라마바사아", "ab", "abcdefghij123456", "길동A1"})
    void allowedNicknames(String nickname) throws Exception {
        insertProfile(A, "원래닉");

        patchProfile(A, "{\"displayName\":\"" + nickname + "\"}").andExpect(status().isOk());
        assertThat(profileRow(A).get("display_name")).isEqualTo(nickname);
    }

    @ParameterizedTest
    @ValueSource(strings = {"가나다라마바사아자", "abcdefghij1234567", "a", "길", "길 동", " 길동", "길동 ", "길동!", "gil_dong",
            "길동😀", ""})
    void rejectedNicknamesChangeNothing(String nickname) throws Exception {
        insertProfile(A, "원래닉");

        patchProfile(A, "{\"displayName\":\"" + nickname + "\",\"exerciseLevel\":\"advanced\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath(ERROR_CODE).value("INVALID_REQUEST"));
        assertThat(profileRow(A).get("display_name")).isEqualTo("원래닉");
        assertThat(profileRow(A).get("exercise_level")).isEqualTo("undecided");
    }

    @Test
    void ownNicknameAndCaseChangeAreAllowedButAnotherUsersIsNot() throws Exception {
        insertProfile(A, "Gildong");
        insertProfile(B, "Other");

        patchProfile(A, "{\"displayName\":\"Gildong\"}").andExpect(status().isOk());
        patchProfile(A, "{\"displayName\":\"gildong\"}").andExpect(status().isOk());
        assertThat(profileRow(A).get("display_name")).isEqualTo("gildong");

        patchProfile(A, "{\"displayName\":\"OTHER\",\"exerciseLevel\":\"advanced\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath(ERROR_CODE).value("NICKNAME_ALREADY_EXISTS"));
        assertThat(profileRow(A).get("display_name")).isEqualTo("gildong");
        assertThat(profileRow(A).get("exercise_level")).isEqualTo("undecided");
    }

    @Test
    void theNicknameKeyIsNotTheProfileField() throws Exception {
        insertProfile(A, "원래닉");

        patchProfile(A, "{\"nickname\":\"바뀜\"}").andExpect(status().isOk());
        assertThat(profileRow(A).get("display_name")).isEqualTo("원래닉");
    }

    // ---------- PATCH: other rules (PROFILE4-4, PROFILE4-5) ----------

    @ParameterizedTest
    @ValueSource(strings = {
        "\"birthDate\":\"\"", "\"birthDate\":\" \"", "\"gender\":\"\"", "\"gender\":\" \"",
        "\"exerciseLevel\":\"\"", "\"exerciseLevel\":\" \"",
        "\"birthDate\":\"1899-12-31\"", "\"birthDate\":\"2026-11-23\"", "\"birthDate\":\"2030-01-01\"",
        "\"birthDate\":\"2001-02-30\"", "\"birthDate\":\"2001-2-3\"", "\"birthDate\":\"20010203\"",
        "\"gender\":\"Male\"", "\"gender\":\"MALE\"", "\"gender\":\"unknown\"",
        "\"exerciseLevel\":\"expert\"", "\"exerciseLevel\":\"Advanced\"",
        "\"regionCode\":\" \"", "\"regionCode\":\"1234567890123456789012345678901\"",
        "\"phoneNumber\":\"02-123-4567\"", "\"phoneNumber\":\"010 1234 5678\"", "\"phoneNumber\":\"0101234567a\"",
        "\"phoneNumber\":\" \"",
        "\"dietaryPreferences\":[\"\"]", "\"dietaryPreferences\":[\" \"]", "\"dietaryPreferences\":[null]",
        "\"dietaryPreferences\":[\"1234567890123456789012345678901\"]",
        "\"dietaryPreferences\":[\"a\",\"b\",\"c\",\"d\",\"e\",\"f\",\"g\",\"h\",\"i\",\"j\",\"k\",\"l\",\"m\",\"n\","
                + "\"o\",\"p\",\"q\",\"r\",\"s\",\"t\",\"u\"]",
        "\"dietaryPreferences\":\"오이\"", "\"dietaryPreferences\":{}",
    })
    void eachBrokenRuleIs400AndNothingChanges(String brokenField) throws Exception {
        insertProfile(A, "원래닉");
        jdbcTemplate.update("update user_profiles set birth_date = '1990-01-01', gender = 'female' where user_id = ?", A);

        // A valid field travels with the broken one: it must not be saved either.
        patchProfile(A, "{\"displayName\":\"바뀐닉\"," + brokenField + "}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath(ERROR_CODE).value("INVALID_REQUEST"));

        Map<String, Object> row = profileRow(A);
        assertThat(row.get("display_name")).isEqualTo("원래닉");
        assertThat(row.get("birth_date").toString()).isEqualTo("1990-01-01");
        assertThat(row.get("gender")).isEqualTo("female");
        assertThat(row.get("updated_at")).isEqualTo(OLD);
        assertThat(count("user_health_preferences", A)).isZero();
    }

    // Jackson would otherwise turn 12 or true into "12" or "true": "12" passes the nickname rule.
    @ParameterizedTest
    @ValueSource(strings = {
        "\"displayName\":12", "\"displayName\":true", "\"displayName\":1.5",
        "\"birthDate\":19900505", "\"gender\":false", "\"exerciseLevel\":1",
        "\"regionCode\":123", "\"regionCode\":true", "\"phoneNumber\":1012345678",
        "\"dietaryPreferences\":[1]", "\"dietaryPreferences\":[true]", "\"dietaryPreferences\":[1.5]",
        "\"dietaryPreferences\":[\"오이\",1]", "\"dietaryPreferences\":[[\"오이\"]]", "\"dietaryPreferences\":[{}]",
    })
    void nonStringValuesAre400AndNothingChanges(String brokenField) throws Exception {
        insertProfile(A, "원래닉");

        patchProfile(A, "{\"exerciseLevel\":\"advanced\"," + brokenField + "}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath(ERROR_CODE).value("INVALID_REQUEST"));

        Map<String, Object> row = profileRow(A);
        assertThat(row.get("display_name")).isEqualTo("원래닉");
        assertThat(row.get("region_code")).isNull();
        assertThat(row.get("updated_at")).isEqualTo(OLD);
        assertThat(count("user_health_preferences", A)).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"1900-01-01", "2026-11-22"})
    void birthDateBoundariesThatPass(String date) throws Exception {
        insertProfile(A, "원래닉");

        patchProfile(A, "{\"birthDate\":\"" + date + "\"}").andExpect(status().isOk());
        assertThat(profileRow(A).get("birth_date").toString()).isEqualTo(date);
    }

    @ParameterizedTest
    @ValueSource(strings = {"01012345678", "010-1234-5678", "011-123-4567", "0101234-5678"})
    void phoneNumbersThatPass(String phone) throws Exception {
        insertProfile(A, "원래닉");

        patchProfile(A, "{\"phoneNumber\":\"" + phone + "\"}").andExpect(status().isOk());
        assertThat(profileRow(A).get("phone_number")).isEqualTo(phone);
    }

    @Test
    void genderCanBecomeUndisclosed() throws Exception {
        insertProfile(A, "원래닉");
        jdbcTemplate.update("update user_profiles set gender = 'male' where user_id = ?", A);

        patchProfile(A, "{\"gender\":\"undisclosed\"}").andExpect(status().isOk());
        assertThat(profileRow(A).get("gender")).isEqualTo("undisclosed");
    }

    // ---------- PATCH: which table is saved, updated_at (PROFILE4-3, PROFILE4-7) ----------

    @Test
    void updatedAtChangesOnlyForTheTableThatWasSent() throws Exception {
        insertProfile(A, "원래닉");
        insertPreferences(A, "[\"오이\"]");

        patchProfile(A, "{\"displayName\":\"바뀐닉\"}").andExpect(status().isOk());
        assertThat(profileRow(A).get("updated_at")).isEqualTo(NOW_LOCAL);
        assertThat(preferenceUpdatedAt(A)).isEqualTo(OLD);

        jdbcTemplate.update("update user_profiles set updated_at = ? where user_id = ?", OLD, A);
        patchProfile(A, "{\"dietaryPreferences\":[\"고수\"]}").andExpect(status().isOk());
        assertThat(preferenceUpdatedAt(A)).isEqualTo(NOW_LOCAL);
        assertThat(profileRow(A).get("updated_at")).isEqualTo(OLD);
    }

    @Test
    void firstPatchWithoutAProfileRowKeepsTheRequestedExerciseLevel() throws Exception {
        patchProfile(A, "{\"exerciseLevel\":\"advanced\",\"gender\":\"female\",\"displayName\":\"첫프로필\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.exerciseLevel").value("advanced"));

        Map<String, Object> row = profileRow(A); // read back from MySQL, not from JPA
        assertThat(row.get("exercise_level")).isEqualTo("advanced");
        assertThat(row.get("gender")).isEqualTo("female");
        assertThat(row.get("display_name")).isEqualTo("첫프로필");
        assertThat(row.get("updated_at")).isEqualTo(NOW_LOCAL);

        perform(get(PROFILE).header(HttpHeaders.AUTHORIZATION, bearer(A)))
                .andExpect(jsonPath("$.data.exerciseLevel").value("advanced"))
                .andExpect(jsonPath("$.data.gender").value("female"));
    }

    @Test
    void onlyTheTableWithAFieldIsSaved() throws Exception {
        patchProfile(A, "{\"displayName\":\"닉만\"}").andExpect(status().isOk());
        assertThat(count("user_profiles", A)).isOne();
        assertThat(count("user_health_preferences", A)).isZero();

        patchProfile(B, "{\"dietaryPreferences\":[\"오이\"]}").andExpect(status().isOk());
        assertThat(count("user_health_preferences", B)).isOne();
        assertThat(count("user_profiles", B)).isZero();
    }

    @Test
    void clearingInputsAlsoCountAsChanges() throws Exception {
        patchProfile(A, "{\"dietaryPreferences\":[]}").andExpect(status().isOk());
        assertThat(count("user_health_preferences", A)).isOne();
        assertThat(foods(A)).isEmpty();
        assertThat(count("user_profiles", A)).isZero();

        patchProfile(B, "{\"phoneNumber\":\"\"}").andExpect(status().isOk());
        assertThat(count("user_profiles", B)).isOne();
        assertThat(profileRow(B).get("phone_number")).isNull();
        assertThat(count("user_health_preferences", B)).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"displayName\":null,\"birthDate\":null,\"gender\":null,\"regionCode\":null,"
            + "\"exerciseLevel\":null,\"phoneNumber\":null,\"dietaryPreferences\":null}"})
    void emptyRequestChangesNothing(String body) throws Exception {
        insertProfile(A, "원래닉");
        insertPreferences(A, "[\"오이\"]");

        patchProfile(A, body)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.displayName").value("원래닉"))
                .andExpect(jsonPath("$.data.dietaryPreferences[0]").value("오이"));
        assertThat(profileRow(A).get("updated_at")).isEqualTo(OLD);
        assertThat(preferenceUpdatedAt(A)).isEqualTo(OLD);

        // B has no rows: none are created.
        patchProfile(B, body).andExpect(status().isOk()).andExpect(jsonPath("$.data.exerciseLevel").value("undecided"));
        assertThat(count("user_profiles", B)).isZero();
        assertThat(count("user_health_preferences", B)).isZero();
    }

    @Test
    void missingOrBrokenBodyIs400() throws Exception {
        perform(patch(PROFILE).header(HttpHeaders.AUTHORIZATION, bearer(A)).contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest());
        patchProfile(A, "{\"displayName\":").andExpect(status().isBadRequest());
    }

    // ---------- other users, unknown fields (PROFILE4-8) ----------

    @Test
    void eachUserSeesAndChangesOnlyTheirOwnProfile() throws Exception {
        insertProfile(A, "에이");
        insertProfile(B, "비이");

        patchProfile(A, "{\"displayName\":\"에이바뀜\",\"dietaryPreferences\":[\"오이\"]}").andExpect(status().isOk());

        assertThat(profileRow(B).get("display_name")).isEqualTo("비이");
        assertThat(profileRow(B).get("updated_at")).isEqualTo(OLD);
        assertThat(count("user_health_preferences", B)).isZero();
        perform(get(PROFILE).header(HttpHeaders.AUTHORIZATION, bearer(B)))
                .andExpect(jsonPath("$.data.displayName").value("비이"))
                .andExpect(jsonPath("$.data.dietaryPreferences").isEmpty());
        perform(get(ME).header(HttpHeaders.AUTHORIZATION, bearer(B)))
                .andExpect(jsonPath("$.data.userId").value(B))
                .andExpect(jsonPath("$.data.nickname").value("비이"));
    }

    @Test
    void unknownFieldsCannotPickTheUserOrChangeRoleOrStatus() throws Exception {
        insertProfile(A, "에이");
        insertProfile(B, "비이");

        patchProfile(A, "{\"userId\":" + B + ",\"role\":\"super_admin\",\"userRole\":\"super_admin\","
                + "\"accountStatus\":\"deleted\",\"displayName\":\"에이바뀜\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.displayName").value("에이바뀜"));

        assertThat(profileRow(A).get("display_name")).isEqualTo("에이바뀜");
        assertThat(profileRow(B).get("display_name")).isEqualTo("비이");
        for (long id : new long[] {A, B}) {
            Map<String, Object> user = jdbcTemplate.queryForMap(
                    "select user_role, account_status from users where user_id = ?", id);
            assertThat(user.get("user_role")).isEqualTo("user");
            assertThat(user.get("account_status")).isEqualTo("active");
        }
    }

    // ---------- helpers ----------

    private void insertUser(long id, String email, String passwordHash, String pinHash) {
        jdbcTemplate.update("insert into users (user_id, email, username, password_hash, pin_hash, account_status,"
                + " is_agreed_term) values (?, ?, ?, ?, ?, 'active', true)", id, email, "실명" + id, passwordHash, pinHash);
    }

    private void insertProfile(long id, String displayName) {
        jdbcTemplate.update("insert into user_profiles (user_id, display_name, updated_at) values (?, ?, ?)",
                id, displayName, OLD);
    }

    private void insertPreferences(long id, String json) {
        jdbcTemplate.update("insert into user_health_preferences (user_id, dietary_preferences, updated_at)"
                + " values (?, ?, ?)", id, json, OLD);
    }

    private String bearer(long id) {
        return "Bearer " + jwtTokenProvider.createAccessToken(id, UserRole.USER, NOW);
    }

    private ResultActions patchProfile(long id, String json) throws Exception {
        return perform(patch(PROFILE)
                .header(HttpHeaders.AUTHORIZATION, bearer(id))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json));
    }

    private ResultActions perform(MockHttpServletRequestBuilder request) throws Exception {
        entityManager.flush();
        entityManager.clear();
        return mockMvc.perform(request);
    }

    private Map<String, Object> profileRow(long id) {
        return jdbcTemplate.queryForMap("select * from user_profiles where user_id = ?", id);
    }

    private List<String> foods(long id) {
        String json = jdbcTemplate.queryForObject(
                "select dietary_preferences from user_health_preferences where user_id = ?", String.class, id);
        return objectMapper.readValue(json, new TypeReference<List<String>>() { });
    }

    private LocalDateTime preferenceUpdatedAt(long id) {
        return jdbcTemplate.queryForObject(
                "select updated_at from user_health_preferences where user_id = ?", LocalDateTime.class, id);
    }

    private int count(String table, long id) {
        return jdbcTemplate.queryForObject("select count(*) from " + table + " where user_id = ?", Integer.class, id);
    }
}
