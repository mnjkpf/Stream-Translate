package com.streamtranslate.backend.savewords;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SavedWordsRepository extends JpaRepository<SavedWords, UUID> {
    List<SavedWords> findByUser_Id(UUID userId);

    // Денні лічильники збережених слів — друга серія графіка активності.
    // Агрегація в SQL із тих самих причин, що і в TranslationHistoryRepository.
    // День — TEXT (TO_CHAR), не CAST(...AS DATE): те саме застереження щодо
    // java.sql.Date і часового поясу JVM, що й у TranslationHistoryRepository.countByDay.
    @org.springframework.data.jpa.repository.Query(value = """
            SELECT TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*) AS total
            FROM saved_words
            WHERE user_id = :userId AND created_at >= :since
            GROUP BY day
            ORDER BY day
            """, nativeQuery = true)
    List<com.streamtranslate.backend.history.TranslationHistoryRepository.DailyCount> countByDay(
            @org.springframework.data.repository.query.Param("userId") UUID userId,
            @org.springframework.data.repository.query.Param("since") java.time.Instant since);

    List<SavedWords> findByUserIdAndUpdatedAtAfter(UUID userId, Instant since);

    Optional<SavedWords> findByIdAndUser_Id(UUID id, UUID userId);

    // Пошук можливого дубля за унікальним обмеженням (uq_saved_words_user_lemma_langs) — використовується
    // в sync, щоб при новому слові з таким самим (user, lemma, sourceLang, targetLang) оновити наявний
    // рядок замість падіння на constraint.
    Optional<SavedWords> findByUser_IdAndLemmaAndSourceLangAndTargetLang(
            UUID userId, String lemma, String sourceLang, String targetLang);
}
