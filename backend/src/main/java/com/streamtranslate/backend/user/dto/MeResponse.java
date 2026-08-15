package com.streamtranslate.backend.user.dto;

import java.time.Instant;
import java.util.Map;
import java.util.function.UnaryOperator;

import com.streamtranslate.backend.user.Users;

// Профіль поточного користувача для popup: базові поля + гнучкі settings.
public record MeResponse(
        String email,
        String displayName,
        Instant createdAt,
        Map<String, String> settings
) {
    // settings проходять через перетворювач (MeController.decryptSettings), бо
    // в базі apiKey лежить зашифрованим, а клієнту потрібен відкритий.
    //
    // Розшифрування передається сюди функцією, а не викликається всередині: DTO не
    // має знати ні про SettingsCrypto, ні про те, які саме поля секретні. Інакше
    // record перестав би бути простим перетворенням сутності у відповідь.
    public static MeResponse from(Users user, UnaryOperator<Map<String, String>> settingsMapper) {
        return new MeResponse(
                user.getEmail(),
                user.getDisplayName(),
                user.getCreatedAt(),
                settingsMapper.apply(user.getSettings()));
    }
}
