package com.streamtranslate.backend.config;

import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.oauth2.server.resource.OAuth2ResourceServerConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;

import io.jsonwebtoken.io.Decoders;

// Захищає все API нашим HMAC-JWT (JwtService/AuthController), а не Google-токеном:
// GoogleTokenVerifier навмисно не має власного @Bean JwtDecoder і використовується вручну лише
// в POST /auth/google, тому тут єдиний JwtDecoder у контексті — конфлікту біном немає.
@Configuration
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, JwtDecoder jwtDecoder) throws Exception {
        http
                .csrf(csrf -> csrf.disable()) // stateless REST з Bearer-токенами, куки не використовуються
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/auth/**").permitAll()
                        .requestMatchers("/actuator/health").permitAll()
                        .requestMatchers("/swagger-ui/**", "/v3/api-docs/**").permitAll() // dev-only, прикрити в прод
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(
                        (OAuth2ResourceServerConfigurer<HttpSecurity>.JwtConfigurer jwt) -> jwt.decoder(jwtDecoder)));

        return http.build();
    }

    // Валідує НАШІ токени (JwtService): той самий base64 HMAC-секрет з app.jwt.secret, той самий
    // алгоритм підпису. Google ID-токени цим декодером ніколи не перевіряються.
    @Bean
    public JwtDecoder jwtDecoder(@Value("${app.jwt.secret}") String jwtSecretBase64) {
        byte[] keyBytes = Decoders.BASE64.decode(jwtSecretBase64);
        return NimbusJwtDecoder.withSecretKey(new SecretKeySpec(keyBytes, "HmacSHA256")).build();
    }
}
