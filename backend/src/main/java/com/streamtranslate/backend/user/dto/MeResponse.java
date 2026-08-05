package com.streamtranslate.backend.user.dto;

import java.time.Instant;
import java.util.Map;

import com.streamtranslate.backend.user.Users;

// Профіль поточного користувача для popup: базові поля + гнучкі settings.
public record MeResponse(
        String email,
        String displayName,
        Instant createdAt,
        Map<String, String> settings
) {
    public static MeResponse from(Users user) {
        return new MeResponse(
                user.getEmail(),
                user.getDisplayName(),
                user.getCreatedAt(),
                user.getSettings());
    }
}
