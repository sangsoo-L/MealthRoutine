package com.healthlab.mealthroutine.backend.ai;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.common.LoginUser;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.Set;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/v1/ai")
public class AiGatewayController {

    private static final int MAX_DIET_REQUEST_BYTES = 16 * 1024;
    private static final Set<String> DIET_FIELDS = Set.of(
            "target_calories_kcal", "meal_types", "excluded_food_ids", "excluded_food_groups",
            "food_type", "food_kinds", "preferences");

    private final AiGateway gateway;
    private final JsonMapper jsonMapper;

    public AiGatewayController(AiGateway gateway, JsonMapper jsonMapper) {
        this.gateway = gateway;
        this.jsonMapper = jsonMapper;
    }

    @PostMapping(path = "/food-analyses", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<JsonNode> analyzeFood(@LoginUser Long userId, @RequestPart("file") MultipartFile file) {
        return ApiResponse.ok(gateway.analyzeFood(userId, file));
    }

    @PostMapping(path = "/diet-recommendations", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ApiResponse<JsonNode> recommendDiet(@LoginUser Long userId, HttpServletRequest request) {
        // Catalog candidates are fetched by the AI service from our food API. A browser cannot supply its own candidates.
        try {
            byte[] body = request.getInputStream().readNBytes(MAX_DIET_REQUEST_BYTES + 1);
            if (body.length > MAX_DIET_REQUEST_BYTES) {
                throw new BusinessException(ErrorCode.AI_REQUEST_TOO_LARGE);
            }
            JsonNode input = jsonMapper.readTree(body);
            if (input == null || !input.isObject() || !DIET_FIELDS.containsAll(input.propertyNames())) {
                throw new BusinessException(ErrorCode.INVALID_REQUEST);
            }
            return ApiResponse.ok(gateway.recommendDiet(userId, input));
        } catch (IOException | JacksonException error) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }
}
