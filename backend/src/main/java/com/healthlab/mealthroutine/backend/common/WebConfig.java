package com.healthlab.mealthroutine.backend.common;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.convert.ApplicationConversionService;
import org.springframework.context.annotation.Configuration;
import org.springframework.format.FormatterRegistry;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final LoginUserArgumentResolver loginUserArgumentResolver;

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(loginUserArgumentResolver);
    }

    // Lets query params use the same lowercase enum values as JSON and the DB (difficulty=beginner).
    @Override
    public void addFormatters(FormatterRegistry registry) {
        ApplicationConversionService.addApplicationConverters(registry);
    }
}
