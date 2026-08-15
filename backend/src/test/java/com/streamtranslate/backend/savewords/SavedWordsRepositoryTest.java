package com.streamtranslate.backend.savewords;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;

import com.streamtranslate.backend.TestcontainersConfiguration;
import com.streamtranslate.backend.user.UserRepository;
import com.streamtranslate.backend.user.Users;

import jakarta.persistence.EntityManager;

// @AutoConfigureTestDatabase(replace = NONE): за замовчуванням @DataJpaTest підміняє БД на H2 —
// вимикаємо підміну, щоб реально йшло в Postgres-контейнер (TestcontainersConfiguration) і Flyway-міграції
// застосовувались, інакше unique-constraint з V3__saved_words_constraints.sql тут просто не існував би.
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
class SavedWordsRepositoryTest {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SavedWordsRepository savedWordsRepository;

    @Autowired
    private EntityManager entityManager;

    @Test
    void findByUserIdReturnsOnlyThatUsersWords() {
        Users owner = persistUser("owner-sub");
        Users other = persistUser("other-sub");

        persistWord(owner, "cat", "cat", "en", "uk");
        persistWord(other, "dog", "dog", "en", "uk");

        List<SavedWords> ownerWords = savedWordsRepository.findByUser_Id(owner.getId());

        assertThat(ownerWords).hasSize(1);
        assertThat(ownerWords.get(0).getLemma()).isEqualTo("cat");
    }

    // Раніше цей тест виставляв updatedAt вручну (setUpdatedAt) і брав cutoff на секунду
    // в майбутнє. Так він працювати не міг: @UpdateTimestamp — згенероване значення, і
    // Hibernate перезаписує ним будь-яке виставлене вручну під час flush. Тому свіже слово
    // отримувало updatedAt = «зараз», що МЕНШЕ за cutoff, і вибірка виходила порожньою.
    // Пройти він міг хіба випадково — якби між двома flush минуло понад секунду.
    //
    // Тепер cutoff береться з реального updatedAt старого слова, а різницю в часі
    // забезпечує коротка пауза. Запит використовує строге ">", тож саме старе слово
    // у результат не потрапляє.
    @Test
    void findByUserIdAndUpdatedAtAfterReturnsOnlyRecentChanges() throws InterruptedException {
        Users owner = persistUser("owner-sub-2");
        SavedWords old = persistWord(owner, "old", "old", "en", "uk");
        entityManager.flush();

        Instant cutoff = old.getUpdatedAt();

        Thread.sleep(50); // щоб updatedAt свіжого слова гарантовано був більшим
        persistWord(owner, "fresh", "fresh", "en", "uk");
        entityManager.flush();

        List<SavedWords> changed = savedWordsRepository.findByUserIdAndUpdatedAtAfter(owner.getId(), cutoff);

        assertThat(changed).extracting(SavedWords::getLemma).containsExactly("fresh");
    }

    @Test
    void duplicateLemmaAndLangsForSameUserViolatesUniqueConstraint() {
        Users owner = persistUser("owner-sub-3");
        persistWord(owner, "run", "run", "en", "uk");
        entityManager.flush();

        SavedWords duplicate = newWord(owner, "run", "run", "en", "uk");

        assertThatThrownBy(() -> savedWordsRepository.saveAndFlush(duplicate))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private Users persistUser(String googleSub) {
        Users user = new Users();
        user.setGoogleSub(googleSub);
        user.setEmail(googleSub + "@example.com");
        user.setDisplayName(googleSub);
        return userRepository.saveAndFlush(user);
    }

    private SavedWords persistWord(Users owner, String text, String lemma, String sourceLang, String targetLang) {
        return savedWordsRepository.saveAndFlush(newWord(owner, text, lemma, sourceLang, targetLang));
    }

    private SavedWords newWord(Users owner, String text, String lemma, String sourceLang, String targetLang) {
        SavedWords word = new SavedWords();
        word.setUser(owner);
        word.setText(text);
        word.setLemma(lemma);
        word.setTranslation("translation-" + UUID.randomUUID());
        word.setSourceLang(sourceLang);
        word.setTargetLang(targetLang);
        return word;
    }
}
