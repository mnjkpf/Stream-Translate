package com.streamtranslate.backend.savewords.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// Тіло POST /words і PUT /words/{id}. Навмисно без id/userId/таймстемпів — id береться з path-параметра
// (PUT) або генерується сервером (POST), userId завжди з JWT (CurrentUser.id), інакше юзер міг би
// підмінити userId і залізти в чужі дані.
public record WordRequest(
        @NotBlank @Size(max = 255) String text,
        @NotBlank @Size(max = 255) String lemma,
        @Size(max = 32) String pos,
        @NotBlank String translation,
        String example,
        @NotBlank @Size(max = 16) String sourceLang,
        @NotBlank @Size(max = 16) String targetLang,
        String context,
        String sourceUrl
) {
}
