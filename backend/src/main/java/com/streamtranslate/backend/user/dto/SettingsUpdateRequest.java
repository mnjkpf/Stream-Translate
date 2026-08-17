package com.streamtranslate.backend.user.dto;

// Часткове оновлення налаштувань: усі поля опційні, у settings мержаться лише
// ті, що прийшли не-null (щоб PUT одного поля не затирав решту).
//
// Набір полів мусить збігатися з тим, що розширення шле в settings:update і читає
// назад у pullSettingsIntoStorage (backendAuth.ts). Відсутнє тут поле Jackson
// мовчки відкидає — без помилки, без логу, — тож розбіжність виявляється лише
// як «налаштування не переїхало на інший пристрій». Саме так загубився keySource.
public record SettingsUpdateRequest(
        String apiKey,
        String sourceLang,
        String targetLang,
        String model,
        String keySource,
        // Мова інтерфейсу розширення: 'uk' | 'en' | 'pl'. Не впливає ні на переклад,
        // ні на промпт — це виключно мова підписів, яку користувач обирає сам.
        String uiLang
) {
}
