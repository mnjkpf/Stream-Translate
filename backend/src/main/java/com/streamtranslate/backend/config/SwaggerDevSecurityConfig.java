package com.streamtranslate.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

// Swagger UI відкритий ЛИШЕ під профілем dev.
//
// Раніше ці шляхи були permitAll у головному ланцюжку, тобто на будь-якому
// сервері віддавали повну карту API — усі ендпоінти, форми запитів і поля DTO.
// Само по собі це не вразливість (ендпоінти й так захищені JWT), але це
// безкоштовна розвідка для того, хто шукатиме слабке місце.
//
// Профіль, а не прапорець у конфізі: у прод-середовищі активний profile=prod,
// і цей клас туди навіть не потрапляє в контекст — забути «вимкнути» неможливо.
//
@Configuration
@Profile("dev")
public class SwaggerDevSecurityConfig {

    // @Order(1) — раніше за головний ланцюжок (@Order(2) у SecurityConfig): цей
    // звужений securityMatcher'ом на два шляхи, головний ловить решту. Без явного
    // порядку swagger потрапив би під anyRequest().authenticated() навіть у dev.
    //
    // Анотація саме на @Bean-методі: Spring Security сортує біни SecurityFilterChain,
    // і для бінів із фабричних методів порядок береться з анотації методу, а не
    // з @Configuration-класу.
    @Bean
    @Order(1)
    public SecurityFilterChain swaggerSecurityFilterChain(HttpSecurity http) throws Exception {
        http
                .securityMatcher("/swagger-ui/**", "/v3/api-docs/**")
                .csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());

        return http.build();
    }
}
