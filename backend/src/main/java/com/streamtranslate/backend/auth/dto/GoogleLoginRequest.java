package com.streamtranslate.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;

// Тіло POST /auth/google — сирий Google ID-токен, як його віддає Google Identity Services на клієнті.
public record GoogleLoginRequest(
        @NotBlank String idToken
) {
}
