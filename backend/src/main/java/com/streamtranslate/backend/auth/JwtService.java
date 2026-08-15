package com.streamtranslate.backend.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import com.streamtranslate.backend.user.Users;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;

// Видача і перевірка НАШИХ JWT. Ключ і код тут повністю відокремлені від auth/google/GoogleTokenVerifier:
// там перевіряють Google-підпис через Google JWKS, тут підписуємо власним HMAC-секретом. Це два різні
// ключі і два різні призначення — плутати їх не можна.
@Service
public class JwtService {

    // Ім'я claim'а, що розрізняє access і refresh (див. TokenType).
    public static final String TYPE_CLAIM = "type";

    // access живе коротко: якщо токен витече з клієнта (розширення), шкода обмежена 15 хвилинами.
    private static final Duration ACCESS_TTL = Duration.ofMinutes(15);
    // refresh живе довго і використовується лише для обміну на новий access (POST /auth/refresh).
    private static final Duration REFRESH_TTL = Duration.ofDays(30);

    // Мінімальна довжина ключа для HMAC-SHA256 за RFC 7518. Перевіряємо самі, щоб дати
    // зрозуміле повідомлення замість WeakKeyException з надр бібліотеки.
    private static final int MIN_SECRET_BYTES = 32;

    private final SecretKey secretKey;

    public JwtService(@Value("${app.jwt.secret:}") String jwtSecretBase64) {
        // Порожнє значення раніше давало "Could not resolve placeholder 'app.jwt.secret'" —
        // повідомлення, з якого неможливо здогадатися, що саме треба задати. Тепер
        // застосунок падає з інструкцією. Так само й для закороткого секрету.
        if (!StringUtils.hasText(jwtSecretBase64)) {
            throw new IllegalStateException(
                    "Не задано app.jwt.secret. У продакшені це змінна середовища APP_JWT_SECRET "
                            + "(base64, мінімум 32 байти). Згенерувати: "
                            + "[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))");
        }

        byte[] keyBytes;
        try {
            keyBytes = Decoders.BASE64.decode(jwtSecretBase64.trim());
        } catch (RuntimeException e) {
            throw new IllegalStateException("app.jwt.secret не є коректним base64", e);
        }
        if (keyBytes.length < MIN_SECRET_BYTES) {
            throw new IllegalStateException("app.jwt.secret закороткий: " + keyBytes.length
                    + " байтів, потрібно щонайменше " + MIN_SECRET_BYTES);
        }

        this.secretKey = Keys.hmacShaKeyFor(keyBytes);
    }

    // Короткоживучий токен для звичайних запитів до захищеного API.
    public String issueAccess(Users user) {
        return issueToken(user, ACCESS_TTL, TokenType.ACCESS);
    }

    // Довгоживучий токен, яким клієнт лише обмінюється на новий access у /auth/refresh.
    public String issueRefresh(Users user) {
        return issueToken(user, REFRESH_TTL, TokenType.REFRESH);
    }

    private String issueToken(Users user, Duration ttl, TokenType type) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(user.getId().toString()) // sub = наш Users.id, а НЕ Google sub
                .claim(TYPE_CLAIM, type.claimValue())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ttl)))
                .signWith(secretKey)
                .compact();
    }

    // Перевіряє підпис, строк дії І тип токена, повертає user.id з claim sub.
    //
    // Тип обов'язковий: без нього access-токен приймався б у /auth/refresh і його
    // можна було б продовжувати нескінченно, зводячи нанівець короткий TTL.
    //
    // Будь-яка невдача — 401, а не 500: невалідний токен це помилка клієнта.
    // Токени, видані до появи claim'а "type", вважаються невалідними — усі вони
    // й так стали такими при зміні секрету на продакшені.
    public UUID parseUserId(String token, TokenType expectedType) {
        Claims claims;
        try {
            claims = Jwts.parser()
                    .verifyWith(secretKey)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (JwtException | IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Недійсний токен");
        }

        if (!expectedType.claimValue().equals(claims.get(TYPE_CLAIM, String.class))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Токен іншого призначення");
        }

        try {
            return UUID.fromString(claims.getSubject());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Недійсний токен");
        }
    }
}
