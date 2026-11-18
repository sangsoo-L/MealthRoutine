package com.healthlab.mealthroutine.backend.user.config;

import com.healthlab.mealthroutine.backend.user.jwt.JwtProperties;
import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(JwtProperties.class)
public class JwtConfig {

    /** One clock for token times and the 7-day withdrawal window, so tests can fix "now". */
    @Bean
    public Clock clock() {
        return Clock.systemDefaultZone();
    }
}
