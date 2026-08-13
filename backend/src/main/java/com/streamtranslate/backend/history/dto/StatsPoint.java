package com.streamtranslate.backend.history.dto;

import java.time.LocalDate;

// Одна точка графіка: скільки перекладів і скільки збережених слів за добу.
// Порожні дні теж присутні (з нулями) — інакше графік стискав би паузи
// в активності й показував би хибну картину рівномірного навчання.
public record StatsPoint(
        LocalDate date,
        long translations,
        long savedWords
) {
}
