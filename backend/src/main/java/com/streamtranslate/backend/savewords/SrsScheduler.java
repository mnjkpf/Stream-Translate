package com.streamtranslate.backend.savewords;

import java.time.Duration;
import java.time.Instant;

import org.springframework.stereotype.Component;

// Окремий компонент, а не метод у WordService: логіка інтервального повторення
// тестується ізольовано, без БД і без Spring-контексту.
@Component
public class SrsScheduler {

    // Кожен наступний інтервал приблизно вдвічі-втричі більший за попередній —
    // картка спливає саме тоді, коли ось-ось забудеться, а не по рівному кроку.
    private static final int[] INTERVAL_DAYS = {1, 3, 7, 16, 35, 90};

    public void review(SavedWords word, ReviewGrade grade) {
        Instant now = Instant.now();
        word.setReviewedAt(now);

        switch (grade) {
            case AGAIN -> {
                word.setSrsLevel(0);
                word.setLapses(word.getLapses() + 1);
                word.setDueAt(now);
            }
            case HARD -> word.setDueAt(now.plus(Duration.ofDays(intervalDays(word.getSrsLevel()))));
            case GOOD -> promote(word, now, 1);
            case EASY -> promote(word, now, 2);
        }
    }

    private void promote(SavedWords word, Instant now, int step) {
        int level = capLevel(word.getSrsLevel() + step);
        word.setSrsLevel(level);
        word.setDueAt(now.plus(Duration.ofDays(intervalDays(level))));
    }

    private int intervalDays(int level) {
        return INTERVAL_DAYS[capLevel(level)];
    }

    // Верхня межа обов'язкова: EASY на передостанньому рівні дає +2 і без цього
    // вилетів би за межі масиву. Нижня межа не потрібна (AGAIN завжди ставить 0),
    // але clamp симетрично захищає й від'ємні рівні, якщо вони колись з'являться.
    private int capLevel(int level) {
        return Math.max(0, Math.min(level, INTERVAL_DAYS.length - 1));
    }
}
