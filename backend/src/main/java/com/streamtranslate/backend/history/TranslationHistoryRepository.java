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
    @Query(value = """
            SELECT CAST(created_at AT TIME ZONE 'UTC' AS DATE) AS day, COUNT(*) AS total
            FROM translation_history
            WHERE user_id = :userId AND created_at >= :since
            GROUP BY day
            ORDER BY day
            """, nativeQuery = true)
    List<DailyCount> countByDay(@Param("userId") UUID userId, @Param("since") Instant since);

    @Modifying
    @Query("DELETE FROM TranslationHistory h WHERE h.createdAt < :cutoff")
    int deleteOlderThan(@Param("cutoff") Instant cutoff);

    // Проєкція для нативного запиту вище.
    interface DailyCount {
        java.sql.Date getDay();

        long getTotal();
    }
}
