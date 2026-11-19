package com.healthlab.mealthroutine.backend.user.jwt;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * app.jwt.* settings. {@code secret} is the Base64 text from JWT_SECRET (JWT_SECRET_TEST in tests).
 * toString() never prints the secret.
 */
@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(String secret, Duration accessTtl, Duration refreshTtl) {

    @Override
    public String toString() {
        return "JwtProperties[secret=(hidden), accessTtl=" + accessTtl + ", refreshTtl=" + refreshTtl + "]";
    }
}
