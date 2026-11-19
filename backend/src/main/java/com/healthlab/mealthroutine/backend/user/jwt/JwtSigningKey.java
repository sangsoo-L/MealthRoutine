package com.healthlab.mealthroutine.backend.user.jwt;

import io.jsonwebtoken.security.Keys;
import java.util.Base64;
import javax.crypto.SecretKey;

/**
 * Turns the Base64 text in JWT_SECRET into an HS256 key (decision JWT-KEY-2).
 * Fails fast with a message that never contains the key itself.
 */
public final class JwtSigningKey {

    static final int MIN_KEY_BYTES = 32; // HS256 needs at least 256 bits

    private JwtSigningKey() {
    }

    public static SecretKey fromBase64(String base64) {
        if (base64 == null || base64.isBlank()) {
            throw new IllegalStateException("JWT_SECRET is not set. Put Base64 of 32+ random bytes in .env.");
        }
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(base64.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("JWT_SECRET is not valid Base64.");
        }
        if (bytes.length < MIN_KEY_BYTES) {
            throw new IllegalStateException(
                    "JWT_SECRET decodes to " + bytes.length + " bytes; at least " + MIN_KEY_BYTES + " are required.");
        }
        return Keys.hmacShaKeyFor(bytes);
    }
}
