package com.healthlab.mealthroutine.backend.user.jwt;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Header;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.JwtParser;
import io.jsonwebtoken.Jwts;
import java.time.Clock;
import java.time.Instant;
import java.util.Date;
import java.util.Locale;
import java.util.regex.Pattern;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Component;

/**
 * Issues and reads access tokens (P-01): HS256, claims sub=userId, role, token_type=access, 30 minutes.
 * The key is read once at startup, so a bad JWT_SECRET stops the server before any request.
 */
@Component
public class JwtTokenProvider {

    static final String TOKEN_TYPE_CLAIM = "token_type";
    static final String ACCESS_TOKEN_TYPE = "access";
    static final String PIN_TOKEN_TYPE = "pin";
    private static final String ALGORITHM = "HS256";
    // Digits only, no sign or leading zero. The range (1 to Long.MAX_VALUE) is checked when parsing.
    private static final Pattern USER_ID = Pattern.compile("[1-9][0-9]*");

    private final SecretKey key;
    private final JwtProperties properties;
    private final Clock clock;
    private final JwtParser parser;

    public JwtTokenProvider(JwtProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
        this.key = JwtSigningKey.fromBase64(properties.secret());
        // Only signed tokens (JWS) pass parseSignedClaims; unsigned "alg: none" tokens and JWE are rejected.
        this.parser = Jwts.parser()
                .verifyWith(key)
                .clock(() -> Date.from(clock.instant()))
                .build();
    }

    public String createAccessToken(Long userId, Enum<?> role, Instant now) {
        return Jwts.builder()
                .subject(String.valueOf(userId))
                .claim("role", role.name().toLowerCase(Locale.ROOT))
                .claim(TOKEN_TYPE_CLAIM, ACCESS_TOKEN_TYPE)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(properties.accessTtl())))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    /**
     * PIN token (P-02, PIN7-5): sub=userId, token_type=pin, lifetime app.jwt.pin-ttl. Sent as X-Pin-Token to the
     * PIN-protected APIs (member unit 8). The server keeps no state for it, so it stays valid until exp even after
     * a PIN change, logout or password change.
     */
    public String createPinToken(Long userId, Instant now) {
        return Jwts.builder()
                .subject(String.valueOf(userId))
                .claim(TOKEN_TYPE_CLAIM, PIN_TOKEN_TYPE)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(properties.pinTtl())))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    /**
     * Checks the signature with our key, the HS256 algorithm, exp, sub and token_type.
     * Only token problems become EXPIRED/INVALID here; nothing else is caught.
     */
    public AccessTokenResult parseAccessToken(String token) {
        return parse(token, ACCESS_TOKEN_TYPE);
    }

    /**
     * Same checks as {@link #parseAccessToken} but for token_type=pin, so neither kind of token is accepted in
     * the other's place. The caller must still check that the user id equals the logged-in user (unit 8).
     */
    public AccessTokenResult parsePinToken(String token) {
        return parse(token, PIN_TOKEN_TYPE);
    }

    private AccessTokenResult parse(String token, String tokenType) {
        Jws<Claims> jws;
        try {
            jws = parser.parseSignedClaims(token);
        } catch (ExpiredJwtException e) {
            // The signature was already checked before jjwt looked at exp. A token of another type stays INVALID.
            return userIdOf(e.getHeader(), e.getClaims(), tokenType) == null
                    ? AccessTokenResult.invalid() : AccessTokenResult.expired();
        } catch (JwtException | IllegalArgumentException e) {
            return AccessTokenResult.invalid();
        }
        Claims claims = jws.getPayload();
        Long userId = userIdOf(jws.getHeader(), claims, tokenType);
        if (userId == null) {
            return AccessTokenResult.invalid();
        }
        // jjwt only rejects now.after(exp), so a token at exactly exp would pass. RFC 7519: now must be before exp.
        if (!clock.instant().isBefore(claims.getExpiration().toInstant())) {
            return AccessTokenResult.expired();
        }
        return AccessTokenResult.valid(userId);
    }

    /** The user id when every required part is right, otherwise null. */
    private static Long userIdOf(Header header, Claims claims, String tokenType) {
        if (header == null || claims == null || !ALGORITHM.equals(header.getAlgorithm())) {
            return null;
        }
        // jjwt checks exp only when it exists, so a token without exp would never expire.
        if (claims.getExpiration() == null) {
            return null;
        }
        if (!tokenType.equals(claims.get(TOKEN_TYPE_CLAIM))) {
            return null;
        }
        String subject = claims.getSubject();
        if (subject == null || !USER_ID.matcher(subject).matches()) {
            return null;
        }
        try {
            return Long.valueOf(subject); // any positive long, so every id we can issue is accepted
        } catch (NumberFormatException e) {
            return null; // larger than Long.MAX_VALUE
        }
    }
}
