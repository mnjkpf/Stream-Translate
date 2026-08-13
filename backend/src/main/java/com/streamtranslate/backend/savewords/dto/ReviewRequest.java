package com.streamtranslate.backend.savewords.dto;

import com.streamtranslate.backend.savewords.ReviewGrade;

import jakarta.validation.constraints.NotNull;

// Тіло POST /review/{id}.
public record ReviewRequest(
        @NotNull ReviewGrade grade
) {
}
