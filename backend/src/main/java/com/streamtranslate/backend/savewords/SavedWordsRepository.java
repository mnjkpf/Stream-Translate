package com.streamtranslate.backend.savewords;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SavedWordsRepository extends JpaRepository<SavedWords, UUID> {
    List<SavedWords> findByUser_Id(UUID userId);

    List<SavedWords> findByUserIdAndUpdatedAtAfter(UUID userId, Instant since);

    Optional<SavedWords> findByIdAndUser_Id(UUID id, UUID userId);

    // Пошук можливого дубля за унікальним обмеженням (uq_saved_words_user_lemma_langs) — використовується
    // в sync, щоб при новому слові з таким самим (user, lemma, sourceLang, targetLang) оновити наявний
    // рядок замість падіння на constraint.
    Optional<SavedWords> findByUser_IdAndLemmaAndSourceLangAndTargetLang(
            UUID userId, String lemma, String sourceLang, String targetLang);
}
