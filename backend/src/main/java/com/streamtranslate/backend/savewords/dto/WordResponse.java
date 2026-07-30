package com.streamtranslate.backend.savewords.dto;

import java.time.Instant;
import java.util.UUID;

import com.streamtranslate.backend.savewords.SavedWords;

public record WordResponse(
        UUID id,
        String text,
        String lemma,
        String pos,
        String translation,
        String example,
        String sourceLang,
        String targetLang,
        String context,
        String sourceUrl,
        Instant createdAt,
        Instant updatedAt
) {
    public static WordResponse from(SavedWords word) {
        return new WordResponse(
                word.getId(),
                word.getText(),
                word.getLemma(),
                word.getPos(),
                word.getTranslation(),
                word.getExample(),
                word.getSourceLang(),
                word.getTargetLang(),
                word.getContext(),
                word.getSourceUrl(),
                word.getCreatedAt(),
                word.getUpdatedAt());
    }
}
