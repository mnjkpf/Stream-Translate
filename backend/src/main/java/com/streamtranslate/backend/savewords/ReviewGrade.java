package com.streamtranslate.backend.savewords;

import com.fasterxml.jackson.annotation.JsonCreator;

public enum ReviewGrade {
    AGAIN,
    HARD,
    GOOD,
    EASY;

    // Розширення шле "again"/"hard"/"good"/"easy" у нижньому регістрі.
    @JsonCreator
    public static ReviewGrade from(String value) {
        return ReviewGrade.valueOf(value.trim().toUpperCase());
    }
}
