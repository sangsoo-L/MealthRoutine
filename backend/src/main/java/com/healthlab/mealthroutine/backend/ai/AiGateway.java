package com.healthlab.mealthroutine.backend.ai;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.common.ratelimit.AttemptLimiter;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.concurrent.Semaphore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;

@Component
public class AiGateway {

    private static final long MAX_PHOTO_BYTES = 10L * 1024 * 1024;
    private static final String NO_CANDIDATES =
            "선택한 음식 종류와 제외 조건에 맞는 추천 후보가 없습니다. 조건을 변경해 주세요.";

    private final AttemptLimiter limiter;
    private final boolean enabled;
    private final RestClient client;
    private final Semaphore inference = new Semaphore(1);

    public AiGateway(AttemptLimiter limiter,
            @Value("${AI_BASE_URL:}") String baseUrl, @Value("${AI_INTERNAL_KEY:}") String internalKey) {
        this.limiter = limiter;
        enabled = !baseUrl.isBlank() && !internalKey.isBlank();
        var httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        var factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(Duration.ofSeconds(210));
        client = RestClient.builder()
                .requestFactory(factory)
                .baseUrl(baseUrl)
                .defaultHeader("X-Internal-Key", internalKey)
                .build();
    }

    public JsonNode analyzeFood(Long userId, MultipartFile file) {
        if (file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        if (file.getSize() > MAX_PHOTO_BYTES) {
            throw new BusinessException(ErrorCode.AI_REQUEST_TOO_LARGE);
        }
        String format = file.getContentType();
        if (!MediaType.IMAGE_JPEG_VALUE.equals(format) && !MediaType.IMAGE_PNG_VALUE.equals(format)) {
            throw new BusinessException(ErrorCode.AI_IMAGE_TYPE_UNSUPPORTED);
        }
        var headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(format));
        String filename = MediaType.IMAGE_JPEG_VALUE.equals(format) ? "photo.jpg" : "photo.png";
        headers.setContentDisposition(ContentDisposition.formData().name("file").filename(filename).build());
        var body = new LinkedMultiValueMap<String, Object>();
        body.add("file", new HttpEntity<>(file.getResource(), headers));
        return forward(userId, "/internal/ai/food-analyses", MediaType.MULTIPART_FORM_DATA, body, false);
    }

    public JsonNode recommendDiet(Long userId, JsonNode request) {
        return forward(userId, "/internal/ai/diet-recommendations", MediaType.APPLICATION_JSON, request, true);
    }

    private JsonNode forward(Long userId, String path, MediaType type, Object body, boolean diet) {
        if (!enabled || !inference.tryAcquire()) {
            throw new BusinessException(ErrorCode.AI_UNAVAILABLE);
        }
        try {
            if (!limiter.tryAcquire("ai:user:" + userId, 5, Duration.ofMinutes(1)).allowed()) {
                throw new BusinessException(ErrorCode.TOO_MANY_REQUESTS);
            }
            JsonNode data = client.post().uri(path).contentType(type).body(body).retrieve().body(JsonNode.class);
            if (data == null || !data.isObject()) {
                throw new BusinessException(ErrorCode.AI_UPSTREAM_FAILED);
            }
            return data;
        } catch (RestClientResponseException error) {
            throw new BusinessException(upstreamError(error, diet));
        } catch (RestClientException error) {
            throw new BusinessException(ErrorCode.AI_UPSTREAM_FAILED);
        } finally {
            inference.release();
        }
    }

    private static ErrorCode upstreamError(RestClientResponseException error, boolean diet) {
        return switch (error.getStatusCode().value()) {
            case 400 -> ErrorCode.INVALID_REQUEST;
            case 413 -> ErrorCode.AI_REQUEST_TOO_LARGE;
            case 415 -> ErrorCode.AI_IMAGE_TYPE_UNSUPPORTED;
            case 422 -> diet && noCandidates(error) ? ErrorCode.AI_DIET_NO_CANDIDATES : ErrorCode.AI_REQUEST_INVALID;
            case 429, 503 -> ErrorCode.AI_UNAVAILABLE;
            default -> ErrorCode.AI_UPSTREAM_FAILED;
        };
    }

    private static boolean noCandidates(RestClientResponseException error) {
        try {
            JsonNode detail = error.getResponseBodyAs(JsonNode.class);
            return detail != null && NO_CANDIDATES.equals(detail.path("detail").asText());
        } catch (RestClientException | JacksonException ignored) {
            return false;
        }
    }
}
