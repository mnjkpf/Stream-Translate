package com.streamtranslate.backend.auth.dto;

// Відповідь /auth/google і /auth/refresh — наша пара токенів (Google-токен клієнту більше не повертається).
public record TokenResponse(
        String accessToken,
        String refreshToken
) {
}
