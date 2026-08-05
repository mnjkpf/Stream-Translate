package com.streamtranslate.backend.user.dto;

// Часткове оновлення налаштувань: усі поля опційні, у settings мержаться лише
// ті, що прийшли не-null (щоб PUT одного поля не затирав решту).
public record SettingsUpdateRequest(
        String apiKey,
        String sourceLang,
        String targetLang,
        String model
) {
}
