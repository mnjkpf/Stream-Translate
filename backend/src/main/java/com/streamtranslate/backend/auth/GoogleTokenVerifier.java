package com.streamtranslate.backend.auth;

import java.util.List;
import java.util.Set;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;

// Ручна перевірка Google ID-токена, який фронтенд (розширення) присилає в POST /auth/google.
//
// ВАЖЛИВО: цей декодер НЕ підключений до Spring Security filter chain (кроку 6 конфігурації).
// Він викликається вручну, один раз, лише всередині ендпоінта /auth/google, щоб обміняти
// Google-токен на ВЛАСНИЙ JWT сервісу. Уся решта API захищена нашим токеном, а не Google-івським,
// тому інших посилань на googleJwtDecoder за межами цього класу бути не повинно.
@Component
public class GoogleTokenVerifier {

    // JWKS Google — публічні ключі, якими підписані ID-токени. NimbusJwtDecoder сам їх завантажує
    // з мережі та кешує, тому перший verify() зробить реальний HTTP-запит на цей URI.
    private static final String GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";

    // Google історично видає iss в двох форматах — приймаємо обидва, щоб не залежати від того, який саме прийде.
    private static final Set<String> ALLOWED_ISSUERS = Set.of("https://accounts.google.com", "accounts.google.com");

    // Готовий до використання декодер: підпис + iss + aud + exp вже перевірені всередині decode().
    private final JwtDecoder googleJwtDecoder;

    // googleClientId читається з app.google.client-id (application.properties) — це значення з Google Cloud
    // Console для нашого OAuth-клієнта; токен з чужим aud має бути відхилений.
    public GoogleTokenVerifier(@Value("${app.google.client-id}") String googleClientId) {
        // withJwkSetUri сам реалізує перевірку підпису токена ключами з JWKS.
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(GOOGLE_JWKS_URI).build();

        // За замовчуванням NimbusJwtDecoder перевіряє тільки підпис — issuer/audience/timestamp
        // задаємо явно і об'єднуємо через DelegatingOAuth2TokenValidator (усі мають пройти).
        OAuth2TokenValidator<Jwt> timestampValidator = new JwtTimestampValidator(); // перевіряє exp (і nbf, якщо є)
        OAuth2TokenValidator<Jwt> issuerValidator = issuerValidator();
        OAuth2TokenValidator<Jwt> audienceValidator = audienceValidator(googleClientId);
        decoder.setJwtValidator(
                new DelegatingOAuth2TokenValidator<>(timestampValidator, issuerValidator, audienceValidator));

        this.googleJwtDecoder = decoder;
    }

    // Головний метод: приймає сирий Google ID-токен (JWT-рядок), повертає дані користувача.
    // Якщо підпис/iss/aud/exp невалідні — decode() кине JwtException, метод далі не піде.
    public GoogleUser verify(String idToken) {
        Jwt jwt = googleJwtDecoder.decode(idToken); // тут відбувається вся перевірка з validator'ів вище

        String sub = jwt.getSubject();               // claim "sub" — стабільний ID акаунта Google
        String email = jwt.getClaimAsString("email"); // claim "email" — потрібен scope email
        String name = jwt.getClaimAsString("name");   // claim "name" — потрібен scope profile

        return new GoogleUser(sub, email, name);
    }

    // Перевіряє, що iss токена — один з дозволених issuer'ів Google.
    private static OAuth2TokenValidator<Jwt> issuerValidator() {
        return jwt -> {
            // Читаємо claim напряму як Object (не jwt.getIssuer()), бо "accounts.google.com" без схеми
            // впаде при спробі сконвертувати claim у java.net.URL.
            Object rawIssuer = jwt.getClaims().get(JwtClaimNames.ISS);
            String issuer = rawIssuer == null ? null : rawIssuer.toString();

            if (issuer != null && ALLOWED_ISSUERS.contains(issuer)) {
                return OAuth2TokenValidatorResult.success();
            }
            return OAuth2TokenValidatorResult.failure(
                    new OAuth2Error("invalid_token", "Недійсний iss у Google ID-токені: " + issuer, null));
        };
    }

    // Перевіряє, що aud токена містить наш googleClientId — інакше токен видано для чужого клієнта.
    private static OAuth2TokenValidator<Jwt> audienceValidator(String googleClientId) {
        return jwt -> {
            List<String> audience = jwt.getAudience();
            if (audience != null && audience.contains(googleClientId)) {
                return OAuth2TokenValidatorResult.success();
            }
            return OAuth2TokenValidatorResult.failure(
                    new OAuth2Error("invalid_token", "aud Google ID-токена не збігається з googleClientId", null));
        };
    }
}
