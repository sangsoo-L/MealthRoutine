package com.healthlab.mealthroutine.backend.user.jwt;

import static org.assertj.core.api.Assertions.assertThat;

import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.AccessTokenResult.Status;
import io.jsonwebtoken.JwtBuilder;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Date;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.Test;

/**
 * Required parts of an access token (plan v3 5.5). Plain unit tests with a fixed clock; the key is random per run,
 * not the .env key.
 */
class JwtTokenProviderTests {

    private static final Instant ISSUED = Instant.parse("2026-11-19T03:00:00Z");
    private static final Duration ACCESS_TTL = Duration.ofMinutes(30);
    private static final Duration PIN_TTL = Duration.ofMinutes(10);
    private static final Instant EXPIRES = ISSUED.plus(ACCESS_TTL);
    private static final byte[] KEY_BYTES = randomBytes(32);
    private static final SecretKey KEY = Keys.hmacShaKeyFor(KEY_BYTES);

    @Test
    void issuedTokenIsValidForItsUser() {
        String token = providerAt(ISSUED).createAccessToken(7L, UserRole.USER, ISSUED);

        AccessTokenResult result = providerAt(ISSUED).parseAccessToken(token);

        assertThat(result.status()).isEqualTo(Status.VALID);
        assertThat(result.userId()).isEqualTo(7L);
    }

    @Test
    void expiresExactlyAtExp() {
        String token = providerAt(ISSUED).createAccessToken(7L, UserRole.USER, ISSUED);

        assertThat(statusAt(EXPIRES.minusSeconds(1), token)).isEqualTo(Status.VALID);
        // jjwt alone would still accept this one (it only rejects now.after(exp)).
        assertThat(statusAt(EXPIRES, token)).isEqualTo(Status.EXPIRED);
        assertThat(statusAt(EXPIRES.plusSeconds(1), token)).isEqualTo(Status.EXPIRED);
    }

    // ---------- PIN token (PIN7-5) ----------

    @Test
    void pinTokenIsValidForItsUserUntilExactlyTenMinutes() {
        String token = providerAt(ISSUED).createPinToken(7L, ISSUED);

        AccessTokenResult result = providerAt(ISSUED).parsePinToken(token);
        assertThat(result.status()).isEqualTo(Status.VALID);
        assertThat(result.userId()).isEqualTo(7L);
        Instant pinExpires = ISSUED.plus(PIN_TTL);
        assertThat(providerAt(pinExpires.minusSeconds(1)).parsePinToken(token).status()).isEqualTo(Status.VALID);
        assertThat(providerAt(pinExpires).parsePinToken(token).status()).isEqualTo(Status.EXPIRED);
    }

    @Test
    void pinAndAccessTokensAreNeverAcceptedInEachOthersPlace() {
        String pin = providerAt(ISSUED).createPinToken(7L, ISSUED);
        String access = providerAt(ISSUED).createAccessToken(7L, UserRole.USER, ISSUED);

        assertThat(providerAt(ISSUED).parseAccessToken(pin).status()).isEqualTo(Status.INVALID);
        assertThat(providerAt(ISSUED).parsePinToken(access).status()).isEqualTo(Status.INVALID);
        // An expired token of the other type is INVALID, not EXPIRED (no refresh hint for a wrong token).
        Instant late = ISSUED.plus(Duration.ofHours(1));
        assertThat(providerAt(late).parseAccessToken(pin).status()).isEqualTo(Status.INVALID);
        assertThat(providerAt(late).parsePinToken(access).status()).isEqualTo(Status.INVALID);
    }

    @Test
    void pinTokenWithAnotherKeyOrAlgorithmIsInvalid() {
        byte[] otherKey = randomBytes(32);
        String otherSigned = Jwts.builder().subject("7").claim("token_type", "pin").issuedAt(Date.from(ISSUED))
                .expiration(Date.from(ISSUED.plus(PIN_TTL))).signWith(Keys.hmacShaKeyFor(otherKey), Jwts.SIG.HS256)
                .compact();
        String hs384 = Jwts.builder().subject("7").claim("token_type", "pin").issuedAt(Date.from(ISSUED))
                .expiration(Date.from(ISSUED.plus(PIN_TTL))).signWith(Keys.hmacShaKeyFor(randomBytes(48)), Jwts.SIG.HS384)
                .compact();

        assertThat(providerAt(ISSUED).parsePinToken(otherSigned).status()).isEqualTo(Status.INVALID);
        assertThat(providerAt(ISSUED).parsePinToken(hs384).status()).isEqualTo(Status.INVALID);
        assertThat(providerAt(ISSUED).parsePinToken("not-a-jwt").status()).isEqualTo(Status.INVALID);
    }

    @Test
    void tokenWithoutExpIsInvalid() {
        String token = accessClaims("7").signWith(KEY, Jwts.SIG.HS256).compact();

        assertThat(statusAt(ISSUED, token)).isEqualTo(Status.INVALID);
        assertThat(statusAt(ISSUED.plus(Duration.ofDays(365)), token)).isEqualTo(Status.INVALID);
    }

    @Test
    void everyPositiveLongUserIdIsAccepted() {
        for (long userId : new long[] {1L, 1_000_000_000_000_000_000L, Long.MAX_VALUE}) {
            String token = providerAt(ISSUED).createAccessToken(userId, UserRole.USER, ISSUED);
            AccessTokenResult result = providerAt(ISSUED).parseAccessToken(token);
            assertThat(result.status()).as("userId=%d", userId).isEqualTo(Status.VALID);
            assertThat(result.userId()).isEqualTo(userId);
        }
    }

    @Test
    void subjectMustBeAPositiveUserId() {
        String tooLarge = "9223372036854775808"; // Long.MAX_VALUE + 1
        for (String subject : new String[] {"abc", "0", "-1", "", "+7", "007", tooLarge, "1".repeat(30)}) {
            String token = withExp(accessClaims(subject)).signWith(KEY, Jwts.SIG.HS256).compact();
            assertThat(statusAt(ISSUED, token)).as("sub=%s", subject).isEqualTo(Status.INVALID);
        }
        String noSubject = withExp(Jwts.builder().claim("token_type", "access")).signWith(KEY, Jwts.SIG.HS256).compact();
        assertThat(statusAt(ISSUED, noSubject)).isEqualTo(Status.INVALID);
    }

    @Test
    void onlyAccessTokensAreAccepted() {
        String noType = withExp(Jwts.builder().subject("7")).signWith(KEY, Jwts.SIG.HS256).compact();
        String pinType = withExp(Jwts.builder().subject("7").claim("token_type", "pin"))
                .signWith(KEY, Jwts.SIG.HS256).compact();

        assertThat(statusAt(ISSUED, noType)).isEqualTo(Status.INVALID);
        assertThat(statusAt(ISSUED, pinType)).isEqualTo(Status.INVALID);
        // An expired token of another type is INVALID, not EXPIRED: refreshing would not help.
        assertThat(statusAt(EXPIRES.plusSeconds(1), pinType)).isEqualTo(Status.INVALID);
    }

    @Test
    void otherKeysAlgorithmsAndUnsignedTokensAreInvalid() {
        String otherKey = withExp(accessClaims("7"))
                .signWith(Keys.hmacShaKeyFor(randomBytes(32)), Jwts.SIG.HS256).compact();
        String hs384 = withExp(accessClaims("7"))
                .signWith(Keys.hmacShaKeyFor(randomBytes(48)), Jwts.SIG.HS384).compact();
        String unsigned = withExp(accessClaims("7")).compact(); // header alg: none

        assertThat(statusAt(ISSUED, otherKey)).isEqualTo(Status.INVALID);
        assertThat(statusAt(ISSUED, hs384)).isEqualTo(Status.INVALID);
        assertThat(statusAt(ISSUED, unsigned)).isEqualTo(Status.INVALID);
    }

    /**
     * The tests above also differ in key, so they would pass without the HS256 check. Here the server key is
     * 64 bytes and the tokens are signed with that same key, so jjwt verifies them and only the HS256 check
     * can reject them.
     */
    @Test
    void sameKeyWithAnotherHmacAlgorithmIsInvalid() {
        byte[] longKeyBytes = randomBytes(64);
        SecretKey longKey = Keys.hmacShaKeyFor(longKeyBytes);
        JwtTokenProvider provider = new JwtTokenProvider(new JwtProperties(
                Base64.getEncoder().encodeToString(longKeyBytes), ACCESS_TTL, Duration.ofDays(14), PIN_TTL),
                Clock.fixed(ISSUED, ZoneOffset.UTC));

        String hs256 = withExp(accessClaims("7")).signWith(longKey, Jwts.SIG.HS256).compact();
        String hs384 = withExp(accessClaims("7")).signWith(longKey, Jwts.SIG.HS384).compact();
        String hs512 = withExp(accessClaims("7")).signWith(longKey, Jwts.SIG.HS512).compact();

        assertThat(provider.parseAccessToken(hs256).status()).isEqualTo(Status.VALID); // the key itself is fine
        assertThat(provider.parseAccessToken(hs384).status()).isEqualTo(Status.INVALID);
        assertThat(provider.parseAccessToken(hs512).status()).isEqualTo(Status.INVALID);
    }

    @Test
    void brokenTextIsInvalid() {
        String token = providerAt(ISSUED).createAccessToken(7L, UserRole.USER, ISSUED);
        String tampered = token.substring(0, token.length() - 2) + (token.endsWith("AA") ? "BB" : "AA");

        for (String text : new String[] {"not-a-jwt", "", "a.b.c", tampered}) {
            assertThat(statusAt(ISSUED, text)).as("token=%s", text).isEqualTo(Status.INVALID);
        }
    }

    private static JwtTokenProvider providerAt(Instant now) {
        JwtProperties properties = new JwtProperties(
                Base64.getEncoder().encodeToString(KEY_BYTES), ACCESS_TTL, Duration.ofDays(14), PIN_TTL);
        return new JwtTokenProvider(properties, Clock.fixed(now, ZoneOffset.UTC));
    }

    private static Status statusAt(Instant now, String token) {
        return providerAt(now).parseAccessToken(token).status();
    }

    private static JwtBuilder accessClaims(String subject) {
        return Jwts.builder().subject(subject).claim("role", "user").claim("token_type", "access")
                .issuedAt(Date.from(ISSUED));
    }

    private static JwtBuilder withExp(JwtBuilder builder) {
        return builder.expiration(Date.from(EXPIRES));
    }

    private static byte[] randomBytes(int length) {
        byte[] bytes = new byte[length];
        new SecureRandom().nextBytes(bytes);
        return bytes;
    }
}
