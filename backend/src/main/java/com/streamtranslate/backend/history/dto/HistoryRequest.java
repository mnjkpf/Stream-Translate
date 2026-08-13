package com.streamtranslate.backend.history.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// Подія перекладу, яку шле розширення після КОЖНОГО успішного перекладу —
// незалежно від того, чий ключ використано. Єдиний шлях запису історії:
// проксі сам нічого не пише, інакше в режимі «свій ключ» історія була б порожньою,
// а в режимі проксі — задвоєною.
public record HistoryRequest(
        @NotBlank @Size(max = 500) String text,
        @NotBlank String translation,
        @NotBlank @Size(max = 16) String mode,
        @NotBlank @Size(max = 32) String sourceLang,
        @NotBlank @Size(max = 32) String targetLang,
        String sourceUrl
) {
}
