package com.healthlab.mealthroutine.backend.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.common.ratelimit.AttemptLimiter;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import tools.jackson.databind.json.JsonMapper;

class AiGatewayTests {

    private record Received(String path, String key, String auth, String type, String body) {}

    private final AtomicReference<Received> received = new AtomicReference<>();
    private HttpServer upstream;
    private AiGateway gateway;
    private int status;
    private String reply;

    @BeforeEach
    void start() throws IOException {
        status = 200;
        reply = "{}";
        upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        upstream.createContext("/internal/ai", exchange -> {
            var headers = exchange.getRequestHeaders();
            received.set(new Received(exchange.getRequestURI().getPath(), headers.getFirst("X-Internal-Key"),
                    headers.getFirst("Authorization"), headers.getFirst("Content-Type"),
                    new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)));
            byte[] bytes = reply.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            try (var body = exchange.getResponseBody()) {
                body.write(bytes);
            }
        });
        upstream.start();
        gateway = new AiGateway(new AttemptLimiter(Clock.systemUTC()),
                "http://127.0.0.1:" + upstream.getAddress().getPort(), "internal-test-key");
    }

    @AfterEach
    void stop() {
        upstream.stop(0);
    }

    @Test
    void forwardsPhotoUsingInternalKeyAndSafeFilename() {
        var file = new MockMultipartFile("file", "user-filename.png", "image/png", new byte[]{11, 22, 33});
        gateway.analyzeFood(10L, file);
        Received request = received.get();
        assertThat(request.path()).isEqualTo("/internal/ai/food-analyses");
        assertThat(request.key()).isEqualTo("internal-test-key");
        assertThat(request.auth()).isNull();
        assertThat(request.type()).startsWith("multipart/form-data;boundary=");
        assertThat(request.body()).contains("name=\"file\"", "filename=\"photo.png\"", "image/png")
                .doesNotContain("user-filename");
    }

    @Test
    void forwardsJsonAndReturnsStructuredResult() {
        reply = """
                {"status":"generated","meals":[]}
                """;
        var input = JsonMapper.shared().readTree("{\"target_calories_kcal\":700,\"meal_types\":[\"lunch\"]}");
        var result = gateway.recommendDiet(10L, input);
        assertThat(received.get().path()).isEqualTo("/internal/ai/diet-recommendations");
        assertThat(received.get().body()).contains("\"target_calories_kcal\":700", "\"lunch\"");
        assertThat(result.get("status").asText()).isEqualTo("generated");
    }

    @Test
    void preservesNoCandidateMeaningButMasksInternalKeyRejection() {
        var input = JsonMapper.shared().createObjectNode();
        status = 422;
        reply = """
                {"detail":"선택한 음식 종류와 제외 조건에 맞는 추천 후보가 없습니다. 조건을 변경해 주세요."}
                """;
        assertThatThrownBy(() -> gateway.recommendDiet(10L, input))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.AI_DIET_NO_CANDIDATES));
        status = 403;
        assertThatThrownBy(() -> gateway.recommendDiet(10L, input))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.AI_UPSTREAM_FAILED));
    }
}
