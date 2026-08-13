package com.streamtranslate.backend.translate.dto;

import com.streamtranslate.backend.translate.TranslateMode;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

// Тіло POST /translate. НАВМИСНО без поля з готовим промптом: сервер будує
// промпт сам із цих полів (PromptBuilder), інакше проксі перетворився б на
// безкоштовний чат загального призначення за рахунок власника ключа.
//
// @Size — не косметика: без обмежень довгий context роздув би кожен запит і
// швидко з'їв токенну квоту.
public record TranslateRequest(
        @NotBlank @Size(max = 500) String text,
        @Size(max = 2000) String context,
        @NotNull TranslateMode mode,
        @NotBlank @Size(max = 32) String sourceLang,
        @NotBlank @Size(max = 32) String targetLang
) {
}
