package com.streamtranslate.backend.translate.dto;

// cached=true означає, що переклад узято зі спільного кешу і квоту він НЕ витратив —
// клієнт може показати це, а тести перевіряють саме цей факт.
public record TranslateResponse(
        String translation,
        boolean cached,
        int remaining
) {
}
