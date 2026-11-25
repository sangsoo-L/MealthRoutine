package com.healthlab.mealthroutine.backend.ai;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AiGatewayApiTests {

    private static final long MEMBER = 1001L;
    private static final String PHOTO = "/api/v1/ai/food-analyses";
    private static final String DIET = "/api/v1/ai/diet-recommendations";
    private static final String INPUT = "{\"target_calories_kcal\":700,\"meal_types\":[\"lunch\"]}";

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired JwtTokenProvider tokens;
    @MockitoBean AiGateway gateway;

    @BeforeEach
    void createMember() {
        jdbc.update("insert into users (user_id, username, is_agreed_term) values (1001, 'ai-test', true)");
    }

    @Test
    void guestsCannotUsePhotoOrDiet() throws Exception {
        mvc.perform(multipart(PHOTO).file(sample()))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.errorCode").value("LOGIN_REQUIRED"));
        mvc.perform(post(DIET).contentType(MediaType.APPLICATION_JSON).content(INPUT))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.errorCode").value("LOGIN_REQUIRED"));
        verifyNoInteractions(gateway);
    }

    @Test
    void returnsResponsesThroughCommonEnvelopeForMembers() throws Exception {
        when(gateway.analyzeFood(eq(MEMBER), any())).thenReturn(JsonMapper.shared().readTree("{\"foods\":[]}"));
        when(gateway.recommendDiet(eq(MEMBER), any())).thenReturn(JsonMapper.shared().readTree("{\"status\":\"generated\"}"));
        mvc.perform(multipart(PHOTO).file(sample()).header("Authorization", bearer()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.foods").isArray());
        mvc.perform(post(DIET).contentType(MediaType.APPLICATION_JSON).content(INPUT).header("Authorization", bearer()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("generated"));
    }

    @Test
    void dietRejectsClientSuppliedCatalogAndOversizedJson() throws Exception {
        for (String invalid : new String[]{"{\"available_foods\":[]}", "{"}) {
            mvc.perform(post(DIET).contentType(MediaType.APPLICATION_JSON).content(invalid).header("Authorization", bearer()))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(post(DIET).contentType(MediaType.APPLICATION_JSON).content(" ".repeat(16385))
                .header("Authorization", bearer()))
                .andExpect(status().isContentTooLarge());
        verifyNoInteractions(gateway);
    }

    private String bearer() {
        return "Bearer " + tokens.createAccessToken(MEMBER, com.healthlab.mealthroutine.backend.user.domain.UserRole.USER, Instant.now());
    }

    private MockMultipartFile sample() {
        return new MockMultipartFile("file", "food.png", "image/png", new byte[]{1, 2});
    }
}
