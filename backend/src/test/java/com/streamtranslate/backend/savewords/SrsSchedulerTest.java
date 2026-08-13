package com.streamtranslate.backend.savewords;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.Test;

// Чиста логіка, без Spring і без БД — саме тому SrsScheduler окремий компонент,
// а не метод у ReviewService: тут не треба ані контейнера, ані контексту.
class SrsSchedulerTest {

    private final SrsScheduler scheduler = new SrsScheduler();

    private static SavedWords wordAtLevel(int level) {
        SavedWords word = new SavedWords();
        word.setSrsLevel(level);
        word.setLapses(0);
        word.setDueAt(Instant.now());
        return word;
    }

    @Test
    void goodTwiceInARowAdvancesTwoLevelsAndSchedulesAboutAWeekOut() {
        SavedWords word = wordAtLevel(0);

        scheduler.review(word, ReviewGrade.GOOD); // 0 -> 1, інтервал[1] = 3 дні
        scheduler.review(word, ReviewGrade.GOOD); // 1 -> 2, інтервал[2] = 7 днів

        assertThat(word.getSrsLevel()).isEqualTo(2);
        // На close-to допуск, а не точне значення: між викликом і перевіркою минає час.
        assertThat(word.getDueAt()).isCloseTo(Instant.now().plus(Duration.ofDays(7)), within(5, ChronoUnit.SECONDS));
    }

    @Test
    void againAtLevelFourResetsLevelBumpsLapsesAndIsNotInFuture() {
        SavedWords word = wordAtLevel(4);
        word.setLapses(2);

        scheduler.review(word, ReviewGrade.AGAIN);

        assertThat(word.getSrsLevel()).isZero();
        assertThat(word.getLapses()).isEqualTo(3);
        assertThat(word.getDueAt()).isBeforeOrEqualTo(Instant.now());
    }

    @Test
    void easyAtTheLastLevelDoesNotOverflowTheIntervalArray() {
        SavedWords word = wordAtLevel(5); // останній індекс сходинки {1, 3, 7, 16, 35, 90}

        scheduler.review(word, ReviewGrade.EASY);

        assertThat(word.getSrsLevel()).isEqualTo(5);
        assertThat(word.getDueAt()).isCloseTo(Instant.now().plus(Duration.ofDays(90)), within(5, ChronoUnit.SECONDS));
    }

    @Test
    void hardDoesNotChangeTheLevel() {
        SavedWords word = wordAtLevel(2);

        scheduler.review(word, ReviewGrade.HARD);

        assertThat(word.getSrsLevel()).isEqualTo(2);
        assertThat(word.getDueAt()).isCloseTo(Instant.now().plus(Duration.ofDays(7)), within(5, ChronoUnit.SECONDS));
    }
}
