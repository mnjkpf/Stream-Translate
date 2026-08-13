package com.streamtranslate.backend.history;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TranslationHistoryRepository extends JpaRepository<TranslationHistory, UUID> {

    Page<TranslationHistory> findByUser_IdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    // Пошук по оригіналу або перекладу. LOWER(...) LIKE — свідомо просто:
    // повнотекстовий пошук Postgres тут був би надлишковим для кількох тисяч
    // рядків одного користувача, а для іншої мови ще й потребував би конфігурації.
    @Query("""
            SELECT h FROM TranslationHistory h
            WHERE h.user.id = :userId
              AND (LOWER(h.text) LIKE LOWER(CONCAT('%', :query, '%'))
                OR LOWER(h.translation) LIKE LOWER(CONCAT('%', :query, '%')))
            ORDER BY h.createdAt DESC
            """)
    Page<TranslationHistory> search(@Param("userId") UUID userId, @Param("query") String query, Pageable pageable);

    // Денні лічильники для графіка. Агрегуємо в SQL, а не тягнемо рядки в застосунок:
    // за 90 днів активного користування це десятки тисяч записів, які клієнту не потрібні.
    // Дата рахується в UTC — той самий пояс, у якому лежать TIMESTAMPTZ.
    //
    // День віддаємо як TEXT (TO_CHAR), а не CAST(... AS DATE): проєкція нативного запиту
    // читає стовпець через звичайний JDBC ResultSet.getDate(), а той конструює java.sql.Date
    // за часовим поясом JVM за замовчуванням (він тут ніде не запінений на UTC — лише
    // hibernate.jdbc.time_zone, а це інша, Hibernate-специфічна властивість, яка на цей
    // шлях читання не поширюється). День у БД полічений рівно у UTC, тож при іншому поясі
    // JVM символьне значення дня і те, що прочитає java.sql.Date, можуть розійтись. TEXT
    // такої неоднозначності не має: 'YYYY-MM-DD' парситься назад через LocalDate.parse без
    // жодного часового поясу в грі.
    @Query(value = """
            SELECT TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*) AS total
            FROM translation_history
            WHERE user_id = :userId AND created_at >= :since
            GROUP BY day
            ORDER BY day
            """, nativeQuery = true)
    List<DailyCount> countByDay(@Param("userId") UUID userId, @Param("since") Instant since);

    @Modifying
    @Query("DELETE FROM TranslationHistory h WHERE h.createdAt < :cutoff")
    int deleteOlderThan(@Param("cutoff") Instant cutoff);

    // Часто шукані, ще не збережені слова — сигнал "варто вчити" для дашборда.
    //
    // Віконні функції в підзапиті замість GROUP BY: потрібні одночасно частота слова
    // (COUNT(*) OVER) і повний рядок найновішого перекладу (translation, source_url,
    // мови), а GROUP BY віддав би лише перше — translation довелось би або агрегувати
    // (MAX() бере алфавітно найбільший рядок, не найновіший), або приєднувати окремим
    // проходом. ROW_NUMBER() OVER (... ORDER BY created_at DESC) нумерує рядки кожної
    // групи від найсвіжішого, і зовнішній запит лишає лише rn = 1 — по одному, вже
    // повному рядку на групу за один прохід по таблиці. CTE із самоприєднанням дало б
    // той самий результат двома сканами.
    //
    // LOWER(text) скрізь для партиціонування й LOWER(sw.lemma) = LOWER(latest.text) для
    // NOT EXISTS: в історії слово лежить так, як стояло в субтитрах (може з великої),
    // а лема — у базовій формі малими. Без зведення регістру вже збережене слово
    // продовжувало б з'являтись у списку.
    //
    // created_at віддаємо як є (TIMESTAMPTZ -> Instant): на відміну від DATE ->
    // java.sql.Date у countByDay, тут немає CAST(...AS DATE), тож проблема з календарем
    // JVM цей шлях не зачіпає.
    @Query(value = """
            SELECT text, translation, source_lang, target_lang, source_url,
                   count, created_at AS last_seen_at
            FROM (
                SELECT
                    text,
                    translation,
                    source_lang,
                    target_lang,
                    source_url,
                    created_at,
                    COUNT(*) OVER (PARTITION BY LOWER(text)) AS count,
                    ROW_NUMBER() OVER (PARTITION BY LOWER(text) ORDER BY created_at DESC) AS rn
                FROM translation_history
                WHERE user_id = :userId AND created_at >= :since
            ) latest
            WHERE rn = 1
              AND count >= :min
              AND NOT EXISTS (
                    SELECT 1 FROM saved_words sw
                    WHERE sw.user_id = :userId AND LOWER(sw.lemma) = LOWER(latest.text)
              )
            ORDER BY count DESC
            LIMIT :limit
            """, nativeQuery = true)
    List<FrequentLookup> findFrequentLookups(@Param("userId") UUID userId, @Param("since") Instant since,
            @Param("min") long min, @Param("limit") int limit);

    // Проєкція для нативного запиту вище. День — String ('YYYY-MM-DD'), не java.sql.Date
    // (див. коментар над countByDay).
    interface DailyCount {
        String getDay();

        long getTotal();
    }

    // Проєкція для findFrequentLookups. Псевдоніми стовпців мають точно відповідати
    // іменам геттерів (last_seen_at -> getLastSeenAt) — Spring Data зіставляє їх за
    // іменем, розбіжність падає в рантаймі при першому виклику, не на компіляції.
    interface FrequentLookup {
        String getText();

        long getCount();

        String getTranslation();

        String getSourceLang();

        String getTargetLang();

        String getSourceUrl();

        Instant getLastSeenAt();
    }
}
