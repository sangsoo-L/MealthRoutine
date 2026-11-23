package com.healthlab.mealthroutine.backend.common;

import com.healthlab.mealthroutine.backend.common.ratelimit.AttemptLimitInterceptor;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.convert.ApplicationConversionService;
import org.springframework.context.annotation.Configuration;
import org.springframework.format.FormatterRegistry;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final LoginUserArgumentResolver loginUserArgumentResolver;
    private final AttemptLimitInterceptor attemptLimitInterceptor;

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(loginUserArgumentResolver);
    }

    // Only these paths are limited (ACCT6-4, PWCHG6-1, PIN7-8); other teams' APIs are not touched.
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(attemptLimitInterceptor)
                .addPathPatterns(AttemptLimitInterceptor.ACCOUNT_LOOKUP_PATH, AttemptLimitInterceptor.PASSWORD_PATH,
                        AttemptLimitInterceptor.PIN_PATH);
    }

    // Lets query params use the same lowercase enum values as JSON and the DB (difficulty=beginner).
    @Override
    public void addFormatters(FormatterRegistry registry) {
        ApplicationConversionService.addApplicationConverters(registry);
    }
}
