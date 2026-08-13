package com.streamtranslate.backend.savewords.dto;

import java.time.Instant;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

// Один запис зміни від клієнта в POST /words/sync.
// id == null -> нове слово (id присвоює сервер; клієнт дізнається його з serverChanges тієї ж відповіді).
// id != null -> оновлення наявного слова, якщо воно в БАЗІ новіше за updatedAt клієнта, сервер виграє (LWW).
public record WordChange(
        UUID id,
        @NotBlank String text,
        @NotBlank String lemma,
        String pos,
        @NotBlank String translation,
        String example,
        @NotBlank String sourceLang,
        @NotBlank String targetLang,
        String context,
        String sourceUrl,
        @NotNull Instant updatedAt
) {
}
