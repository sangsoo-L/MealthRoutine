package com.healthlab.mealthroutine.backend.user.jwt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Base64;
import org.junit.jupiter.api.Test;

/** The key rule (JWT-KEY-1, JWT-KEY-2): missing, non-Base64 or shorter than 32 bytes fails; no auto-generation. */
class JwtSigningKeyTests {

    @Test
    void missingKeyFails() {
        assertThatThrownBy(() -> JwtSigningKey.fromBase64(null)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> JwtSigningKey.fromBase64("  ")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void invalidBase64Fails() {
        String notBase64 = "not*base64*at*all";
        assertThatThrownBy(() -> JwtSigningKey.fromBase64(notBase64))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining(notBase64);
    }

    @Test
    void thirtyOneBytesFailsAndThirtyTwoWorks() {
        String short31 = Base64.getEncoder().encodeToString(new byte[31]);
        String ok32 = Base64.getEncoder().encodeToString(new byte[32]);

        assertThatThrownBy(() -> JwtSigningKey.fromBase64(short31))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("31 bytes")
                .hasMessageNotContaining(short31);
        assertThat(JwtSigningKey.fromBase64(ok32).getEncoded()).hasSize(32);
    }

    @Test
    void propertiesNeverPrintTheSecret() {
        String secret = Base64.getEncoder().encodeToString(new byte[32]);
        assertThat(new JwtProperties(secret, null, null).toString()).doesNotContain(secret);
    }
}
