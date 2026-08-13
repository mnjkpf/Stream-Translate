package com.streamtranslate.backend.history;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

import com.streamtranslate.backend.TestcontainersConfiguration;
import com.streamtranslate.backend.history.dto.FrequentLookupResponse;
import com.streamtranslate.backend.savewords.SavedWords;
import com.streamtranslate.backend.savewords.SavedWordsRepository;
import com.streamtranslate.backend.user.UserRepository;
import com.streamtranslate.backend.user.Users;

import jakarta.persistence.EntityManager;

// findFrequentLookups (нативний запит із віконними функціями, TranslationHistoryRepository):
// частота, найновіший переклад, виключення вже збереженого без урахування регістру.
//
// @Transactional на класі: відкат після кожного тесту (ізоляція без ручного прибирання) і,
// що важливіше, активна транзакція для нативних INSERT нижче. created_at генерується
// @CreationTimestamp і позначений updatable=false — звичайний save() з підміненим полем
// його не оновить (Hibernate просто не покладе колонку в UPDATE), тож контрольований час
// для тесту на "найновіший переклад" пишеться одразу нативним INSERT в обхід сутності.
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class FrequentLookupsTest {

    @Autowired
    private HistoryService historyService;

    @Autowired
    private SavedWordsRepository savedWordsRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private EntityManager entityManager;

    @Test
    void wordSearchedThreeTimesMeetsTheThreshold() {
        Users user = newUser();
        insertHistoryRow(user, "cat", "кіт", Instant.now());
        insertHistoryRow(user, "cat", "кіт", Instant.now());
        insertHistoryRow(user, "cat", "кіт", Instant.now());

        List<FrequentLookupResponse> result = historyService.frequentLookups(user.getId(), 30, 3, 20);

        assertThat(result).extracting(FrequentLookupResponse::text).containsExactly("cat");
    }

    @Test
    void wordSearchedTwiceDoesNotMeetTheThreshold() {
        Users user = newUser();
        insertHistoryRow(user, "dog", "пес", Instant.now());
        insertHistoryRow(user, "dog", "пес", Instant.now());

        List<FrequentLookupResponse> result = historyService.frequentLookups(user.getId(), 30, 3, 20);

        assertThat(result).isEmpty();
    }

    @Test
    void alreadySavedWordIsExcludedRegardlessOfSearchCount() {
        Users user = newUser();
        for (int i = 0; i < 10; i++) {
            insertHistoryRow(user, "apple", "яблуко", Instant.now());
        }
        saveWord(user, "apple");

        List<FrequentLookupResponse> result = historyService.frequentLookups(user.getId(), 30, 3, 20);

        assertThat(result).isEmpty();
    }

    @Test
    void savedWordWithDifferentCaseIsStillExcluded() {
        Users user = newUser();
        for (int i = 0; i < 5; i++) {
            insertHistoryRow(user, "Apple", "яблуко", Instant.now()); // в історії — як стояло в субтитрах
        }
        saveWord(user, "apple"); // лема — в базовій формі, малими

        List<FrequentLookupResponse> result = historyService.frequentLookups(user.getId(), 30, 3, 20);

        assertThat(result).isEmpty();
    }

    @Test
    void returnsTheMostRecentTranslationNotTheFirst() {
        Users user = newUser();
        Instant earlier = Instant.now().minus(2, ChronoUnit.DAYS);
        Instant later = Instant.now().minus(1, ChronoUnit.HOURS);
        insertHistoryRow(user, "run", "старий переклад", earlier);
        insertHistoryRow(user, "run", "новий переклад", later);

        List<FrequentLookupResponse> result = historyService.frequentLookups(user.getId(), 30, 1, 20);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).translation()).isEqualTo("новий переклад");
        assertThat(result.get(0).count()).isEqualTo(2);
    }

    private void insertHistoryRow(Users user, String text, String translation, Instant createdAt) {
        entityManager.createNativeQuery("""
                INSERT INTO translation_history (id, user_id, text, translation, mode, source_lang, target_lang, created_at)
                VALUES (?1, ?2, ?3, ?4, 'word', 'en', 'uk', ?5)
                """)
                .setParameter(1, UUID.randomUUID())
                .setParameter(2, user.getId())
                .setParameter(3, text)
                .setParameter(4, translation)
                .setParameter(5, createdAt)
                .executeUpdate();
    }

    private void saveWord(Users user, String lemma) {
        SavedWords word = new SavedWords();
        word.setUser(user);
        word.setText(lemma);
        word.setLemma(lemma);
        word.setTranslation("переклад");
        word.setSourceLang("en");
        word.setTargetLang("uk");
        savedWordsRepository.saveAndFlush(word);
    }

    private Users newUser() {
        Users user = new Users();
        user.setGoogleSub("sub-" + UUID.randomUUID());
        user.setEmail(UUID.randomUUID() + "@example.com");
        return userRepository.saveAndFlush(user);
    }
}
