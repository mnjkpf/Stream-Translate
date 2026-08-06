package com.streamtranslate.backend.history.dto;

import java.time.Instant;
import java.util.UUID;

import com.streamtranslate.backend.history.TranslationHistory;

public record HistoryResponse(
        UUID id,
        String text,
        String translation,
        String mode,
        String sourceLang,
        String targetLang,
        String sourceUrl,
        Instant createdAt
) {
    public static HistoryResponse from(TranslationHistory h) {
        return new HistoryResponse(
                h.getId(), h.getText(), h.getTranslation(), h.getMode(),
                h.getSourceLang(), h.getTargetLang(), h.getSourceUrl(), h.getCreatedAt());
    }
}
