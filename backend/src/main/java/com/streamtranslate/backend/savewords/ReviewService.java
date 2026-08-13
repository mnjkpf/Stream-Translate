package com.streamtranslate.backend.savewords;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.streamtranslate.backend.savewords.dto.ReviewCountResponse;
import com.streamtranslate.backend.savewords.dto.WordResponse;

import lombok.RequiredArgsConstructor;

// Ендпоінти /review/*. user_id завжди з JWT (currentUserId), той самий захист від IDOR,
// що описаний у WordService: findByIdAndUser_Id, а не findById, і 404 замість 403 —
// щоб чуже слово не відрізнялось від неіснуючого.
@Service
@RequiredArgsConstructor
@Transactional
public class ReviewService {

    // Стеля на розмір черги, той самий прийом, що й MAX_DAYS у HistoryService.stats():
    // без неї ?limit=999999 протягнув би через мережу весь словник.
    private static final int MAX_LIMIT = 100;

    // Рівень, з якого слово вважається вивченим для лічильника mastered (SavedWord.mastered
    // на клієнті) — 5-й щабель SrsScheduler.INTERVAL_DAYS відповідає інтервалу в 90 днів.
    private static final int MASTERED_LEVEL = 5;

    private final SavedWordsRepository savedWordsRepository;
    private final SrsScheduler srsScheduler;

    @Transactional(readOnly = true)
    public List<WordResponse> queue(UUID currentUserId, int limit) {
        int size = Math.min(Math.max(1, limit), MAX_LIMIT);
        return savedWordsRepository
                .findByUser_IdAndDueAtLessThanEqualOrderByDueAtAsc(currentUserId, Instant.now(), PageRequest.of(0, size))
                .stream()
                .map(WordResponse::from)
                .toList();
    }

    public WordResponse review(UUID currentUserId, UUID wordId, ReviewGrade grade) {
        SavedWords word = savedWordsRepository.findByIdAndUser_Id(wordId, currentUserId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Слово не знайдено: " + wordId));
        srsScheduler.review(word, grade);
        // saveAndFlush із тієї ж причини, що й у WordService: інакше у відповіді
        // їхав би updatedAt із попереднього збереження — свіжі srsLevel і dueAt
        // поруч зі старою міткою часу виглядають як зіпсовані дані.
        return WordResponse.from(savedWordsRepository.saveAndFlush(word));
    }

    @Transactional(readOnly = true)
    public ReviewCountResponse count(UUID currentUserId) {
        Instant now = Instant.now();
        int due = savedWordsRepository.countByUser_IdAndDueAtLessThanEqual(currentUserId, now);
        int total = savedWordsRepository.countByUser_Id(currentUserId);
        int mastered = savedWordsRepository.countByUser_IdAndSrsLevelGreaterThanEqual(currentUserId, MASTERED_LEVEL);
        return new ReviewCountResponse(due, total, mastered);
    }
}
