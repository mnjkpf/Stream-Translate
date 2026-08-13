package com.streamtranslate.backend.history.dto;

import java.time.Instant;

import com.streamtranslate.backend.history.TranslationHistoryRepository.FrequentLookup;

// Імена полів мають точно збігатися з FrequentLookup у src/api/backendAuth.ts —
// розбіжність дає undefined в UI без жодної помилки. Record — та сама межа, що й
// HistoryResponse для сутності: проєкцію репозиторію назовні не віддаємо.
public record FrequentLookupResponse(
        String text,
        long count,
        String translation,
        String sourceLang,
        String targetLang,
        String sourceUrl,
        Instant lastSeenAt
) {
    public static FrequentLookupResponse from(FrequentLookup lookup) {
        return new FrequentLookupResponse(
                lookup.getText(), lookup.getCount(), lookup.getTranslation(),
                lookup.getSourceLang(), lookup.getTargetLang(), lookup.getSourceUrl(), lookup.getLastSeenAt());
    }
}
