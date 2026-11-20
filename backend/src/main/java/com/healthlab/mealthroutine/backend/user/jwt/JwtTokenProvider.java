package com.healthlab.mealthroutine.backend.user.jwt;

import io.jsonwebtoken.Jwts;
import java.time.Instant;
import java.util.Date;
import java.util.Locale;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Component;

/**
 * Issues access tokens (P-01): HS256, claims sub=userId and role only, 30 minutes.
 * The key is read once at startup, so a bad JWT_SECRET stops the server before any request.
 */
@Component
public class JwtTokenProvider {

    private final SecretKey key;
    private final JwtProperties properties;

    public JwtTokenProvider(JwtProperties properties) {
        this.properties = properties;
        this.key = JwtSigningKey.fromBase64(properties.secret());
    }

    public String createAccessToken(Long userId, Enum<?> role, Instant now) {
        return Jwts.builder()
                .subject(String.valueOf(userId))
                .claim("role", role.name().toLowerCase(Locale.ROOT))
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(properties.accessTtl())))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }
}
