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

    // Проєкція для нативного запиту вище. День — String ('YYYY-MM-DD'), не java.sql.Date
    // (див. коментар над countByDay).
    interface DailyCount {
        String getDay();

        long getTotal();
    }
}
