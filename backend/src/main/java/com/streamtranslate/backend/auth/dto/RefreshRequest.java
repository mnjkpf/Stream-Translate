package com.streamtranslate.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;

// Тіло POST /auth/refresh — НАШ refresh-токен (виданий /auth/google), не Google-токен.
public record RefreshRequest(
        @NotBlank String refreshToken
) {
}
