package com.streamtranslate.backend.savewords;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.streamtranslate.backend.savewords.dto.SyncRequest;
import com.streamtranslate.backend.savewords.dto.SyncResponse;
import com.streamtranslate.backend.savewords.dto.WordChange;
import com.streamtranslate.backend.savewords.dto.WordRequest;
import com.streamtranslate.backend.savewords.dto.WordResponse;
import com.streamtranslate.backend.user.UserRepository;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

// user_id завжди з JWT (переданий сюди вже як currentUserId), ніколи з тіла запиту — findByIdAndUser_Id
// в update/delete/get є головним захистом від IDOR (чуже слово завжди виглядає як 404, а не 403,
// щоб не підтверджувати існування чужих id).
//
// saveAndFlush, а не save, там де відповідь будується одразу з результату: @CreationTimestamp
// і @UpdateTimestamp проставляються Hibernate під час flush, а той за замовчуванням стається аж
// на коміті транзакції — тобто ПІСЛЯ того, як WordResponse.from() уже зібрав DTO. Через це POST
// віддавав createdAt/updatedAt = null, а PUT — стару мітку. У sync flush не потрібен: запит
// findByUserIdAndUpdatedAtAfter нижче й так змушує Hibernate злити зміни перед виконанням.
@Service
@RequiredArgsConstructor
@Transactional
public class WordService {

    private final SavedWordsRepository savedWordsRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<WordResponse> findAll(UUID currentUserId) {
        return savedWordsRepository.findByUser_Id(currentUserId).stream()
                .map(WordResponse::from)
                .toList();
    }

    // Upsert за унікальним ключем (user, lemma, sourceLang, targetLang): повторне
    // збереження того самого слова оновлює наявний рядок, а не падає на
    // uq_saved_words_user_lemma_langs (інакше «⭐ Зберегти» двічі -> 500).
    public WordResponse create(UUID currentUserId, WordRequest request) {
        SavedWords word = savedWordsRepository
                .findByUser_IdAndLemmaAndSourceLangAndTargetLang(
                        currentUserId, request.lemma(), request.sourceLang(), request.targetLang())
                .orElseGet(() -> {
                    SavedWords fresh = new SavedWords();
                    fresh.setUser(userRepository.getReferenceById(currentUserId)); // юзер уже перевірений при видачі JWT
                    return fresh;
                });
        applyRequest(word, request);
        return WordResponse.from(savedWordsRepository.saveAndFlush(word));
    }

    public WordResponse update(UUID currentUserId, UUID wordId, WordRequest request) {
        SavedWords word = findOwned(currentUserId, wordId);
        applyRequest(word, request);
        return WordResponse.from(savedWordsRepository.saveAndFlush(word));
    }

    public void delete(UUID currentUserId, UUID wordId) {
        SavedWords word = findOwned(currentUserId, wordId);
        savedWordsRepository.delete(word);
    }

    // Local-first sync, last-write-wins за updated_at. MVP-спрощення (свідоме): видалення сюди не входить —
    // tombstones не реалізовані, видалення слів робиться окремим онлайн-запитом DELETE /words/{id}.
    public SyncResponse sync(UUID currentUserId, SyncRequest request) {
        // Фіксуємо час ДО обробки змін: якщо між цим моментом і кінцем методу хтось (інший пристрій)
        // ще щось запише, воно потрапить у наступну дельту (since <= той запис), а не загубиться.
        Instant serverTime = Instant.now();
        Instant since = request.since() != null ? request.since() : Instant.EPOCH;

        List<WordChange> changes = request.changes();
        if (changes != null) {
            changes.forEach(change -> applyChange(currentUserId, change));
        }

        List<WordResponse> serverChanges = savedWordsRepository.findByUserIdAndUpdatedAtAfter(currentUserId, since)
                .stream()
                .map(WordResponse::from)
                .toList();

        return new SyncResponse(serverChanges, serverTime);
    }

    private void applyChange(UUID currentUserId, WordChange change) {
        Optional<SavedWords> existing = change.id() != null
                ? savedWordsRepository.findByIdAndUser_Id(change.id(), currentUserId)
                : Optional.empty();

        // Гоча №2: нове слово, що дублює (user_id, lemma, source_lang, target_lang) наявного — оновлюємо
        // наявний рядок замість insert, інакше впадемо на uq_saved_words_user_lemma_langs.
        if (existing.isEmpty()) {
            existing = savedWordsRepository.findByUser_IdAndLemmaAndSourceLangAndTargetLang(
                    currentUserId, change.lemma(), change.sourceLang(), change.targetLang());
        }

        if (existing.isPresent()) {
            SavedWords word = existing.get();
            if (!change.updatedAt().isAfter(word.getUpdatedAt())) {
                return; // сервер новіший або той самий момент — сервер виграє, клієнтську зміну ігноруємо
            }
            applyChangeFields(word, change);
            savedWordsRepository.save(word);
            return;
        }

        // Справді нове слово: id генерує сервер (@GeneratedValue) — клієнт дізнається його зі serverChanges
        // цієї ж відповіді sync і замінить свій локальний id.
        SavedWords word = new SavedWords();
        word.setUser(userRepository.getReferenceById(currentUserId));
        applyChangeFields(word, change);
        savedWordsRepository.save(word);
    }

    private static void applyChangeFields(SavedWords word, WordChange change) {
        word.setText(change.text());
        word.setLemma(change.lemma());
        word.setPos(change.pos());
        word.setTranslation(change.translation());
        word.setExample(change.example());
        word.setSourceLang(change.sourceLang());
        word.setTargetLang(change.targetLang());
        word.setContext(change.context());
        word.setSourceUrl(change.sourceUrl());
    }

    private SavedWords findOwned(UUID currentUserId, UUID wordId) {
        return savedWordsRepository.findByIdAndUser_Id(wordId, currentUserId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Слово не знайдено: " + wordId));
    }

    private static void applyRequest(SavedWords word, WordRequest request) {
        word.setText(request.text());
        word.setLemma(request.lemma());
        word.setPos(request.pos());
        word.setTranslation(request.translation());
        word.setExample(request.example());
        word.setSourceLang(request.sourceLang());
        word.setTargetLang(request.targetLang());
        word.setContext(request.context());
        word.setSourceUrl(request.sourceUrl());
    }
}
