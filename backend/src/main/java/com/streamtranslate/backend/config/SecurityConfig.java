package com.streamtranslate.backend.config;

import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.oauth2.server.resource.OAuth2ResourceServerConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;

import com.streamtranslate.backend.auth.JwtService;
import com.streamtranslate.backend.auth.TokenType;

import io.jsonwebtoken.io.Decoders;

// Захищає все API нашим HMAC-JWT (JwtService/AuthController), а не Google-токеном:
// GoogleTokenVerifier навмисно не має власного @Bean JwtDecoder і використовується вручну лише
// в POST /auth/google, тому тут єдиний JwtDecoder у контексті — конфлікту біном немає.
//
@Configuration
public class SecurityConfig {

    // @Order саме на @Bean-методі, а не на класі: Spring Security сортує біни
    // SecurityFilterChain, і для бінів із фабричних методів порядок читається з
    // анотації методу. @Order на @Configuration-класі бін не зачіпає — типова
    // помилка, після якої ланцюжки шикуються у випадковому порядку.
    //
    // Цей ланцюжок має бути ПІСЛЯ dev-ланцюжка для swagger: той звужений
    // securityMatcher'ом на два шляхи, а цей ловить усе інше. Якби він ішов
    // першим, swagger потрапив би під anyRequest().authenticated() навіть у dev.
    @Bean
    @Order(2)
    public SecurityFilterChain securityFilterChain(HttpSecurity http, JwtDecoder jwtDecoder) throws Exception {
        http
                .csrf(csrf -> csrf.disable()) // stateless REST з Bearer-токенами, куки не використовуються
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/auth/**").permitAll()
                        // Хостинги перевіряють живість саме цим шляхом, тому він відкритий.
                        // Решта actuator-ендпоінтів не віддається взагалі — див.
                        // management.endpoints.web.exposure.include в application.properties.
                        .requestMatchers("/actuator/health").permitAll()
                        // Політика приватності (static/privacy.html). Chrome Web Store вимагає
                        // публічне посилання на неї, і рецензент відкриває його без жодного
                        // токена — тобто сторінка мусить бути доступна анонімно, інакше
                        // подача відхиляється з причиною «privacy policy URL is not reachable».
                        .requestMatchers("/privacy.html", "/terms.html").permitAll()
                        // Swagger сюди НЕ входить: він відкривається лише під профілем dev
                        // окремим ланцюжком (SwaggerDevSecurityConfig). У прод-профілі
                        // ці шляхи потрапляють під anyRequest().authenticated() нижче.
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(
                        (OAuth2ResourceServerConfigurer<HttpSecurity>.JwtConfigurer jwt) -> jwt.decoder(jwtDecoder)));

        return http.build();
    }

    // Валідує НАШІ токени (JwtService): той самий base64 HMAC-секрет з app.jwt.secret, той самий
    // алгоритм підпису. Google ID-токени цим декодером ніколи не перевіряються.
    //
    // Додатково до підпису й строку дії вимагаємо claim type=access. Це друга половина
    // фікса з TokenType: без неї refresh-токен приймався б як access у звичайних запитах
    // до API — а він живе 30 днів проти 15 хвилин, тож його крадіжка коштувала б значно
    // дорожче. Перевірка саме тут, у декодері, а не в кожному контролері: так її
    // неможливо забути для нового ендпоінта.
    @Bean
    public JwtDecoder jwtDecoder(@Value("${app.jwt.secret}") String jwtSecretBase64) {
        // .trim() обов'язковий і тут: JwtService (той, що ПІДПИСУЄ) обрізає пробіли, і якби
        // значення змінної середовища приїхало з кінцевим переносом рядка — а редактори
        // змінних на хостингах його додають легко — два шляхи вивели б різні ключі з одного
        // й того ж секрету. Симптом був би максимально збиваючим з пантелику: свіжий токен
        // і 401 "An error occurred while attempting to decode the Jwt".
        byte[] keyBytes = Decoders.BASE64.decode(jwtSecretBase64.trim());
        NimbusJwtDecoder decoder = NimbusJwtDecoder
                .withSecretKey(new SecretKeySpec(keyBytes, "HmacSHA256"))
                .build();

        OAuth2TokenValidator<Jwt> accessOnly = jwt -> {
            String type = jwt.getClaimAsString(JwtService.TYPE_CLAIM);
            return TokenType.ACCESS.claimValue().equals(type)
                    ? OAuth2TokenValidatorResult.success()
                    : OAuth2TokenValidatorResult.failure(new OAuth2Error(
                            "invalid_token", "Очікується access-токен", null));
        };

        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefault(), accessOnly));
        return decoder;
    }
}
