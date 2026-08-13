package com.streamtranslate.backend.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.streamtranslate.backend.user.Users;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;

// Видача і перевірка НАШИХ JWT. Ключ і код тут повністю відокремлені від auth/google/GoogleTokenVerifier:
// там перевіряють Google-підпис через Google JWKS, тут підписуємо власним HMAC-секретом. Це два різні
// ключі і два різні призначення — плутати їх не можна.
@Service
public class JwtService {

    // access живе коротко: якщо токен витече з клієнта (розширення), шкода обмежена 15 хвилинами.
    private static final Duration ACCESS_TTL = Duration.ofMinutes(15);
    // refresh живе довго і використовується лише для обміну на новий access (POST /auth/refresh).
    private static final Duration REFRESH_TTL = Duration.ofDays(30);

    // Секрет для HMAC-підпису читаємо з app.jwt.secret (application.properties) — base64-рядок.
    // У репозиторії лежить лише плейсхолдер; реальний production-секрет туди не комітити.
    private final SecretKey secretKey;

    public JwtService(@Value("${app.jwt.secret}") String jwtSecretBase64) {
        byte[] keyBytes = Decoders.BASE64.decode(jwtSecretBase64);
        this.secretKey = Keys.hmacShaKeyFor(keyBytes);
    }

    // Короткоживучий токен для звичайних запитів до захищеного API.
    public String issueAccess(Users user) {
        return issueToken(user, ACCESS_TTL);
    }

    // Довгоживучий токен, яким клієнт лише обмінюється на новий access у /auth/refresh.
    public String issueRefresh(Users user) {
        return issueToken(user, REFRESH_TTL);
    }

    private String issueToken(Users user, Duration ttl) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(user.getId().toString()) // sub = наш Users.id, а НЕ Google sub
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ttl)))
                .signWith(secretKey)
                .compact();
    }

    // Валідує підпис і exp токена (обидва перевіряються всередині parseSignedClaims) і повертає
    // user.id з claim sub. Кидає io.jsonwebtoken.JwtException, якщо токен недійсний/протермінований —
    // виклик з AuthController нічого не ловить, тому невалідний токен зараз завершується 500,
    // а не 401 (обробку помилок на рівень HTTP-статусів ще не додано).
    public UUID parseUserId(String token) {
        String subject = Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload()
                .getSubject();
        return UUID.fromString(subject);
    }
}
