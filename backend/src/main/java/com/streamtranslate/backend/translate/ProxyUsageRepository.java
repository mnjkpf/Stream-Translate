package com.streamtranslate.backend.translate;

import java.time.LocalDate;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProxyUsageRepository extends JpaRepository<ProxyUsage, ProxyUsageId> {

    // Атомарний UPSERT замість read-modify-write через сутність. Два одночасні
    // переклади одного юзера інакше обидва прочитали б count=5 і записали 6 —
    // один запит просто зник би з обліку, і ліміт можна було б обійти
    // паралельними викликами. ON CONFLICT робить це на боці БД під блокуванням рядка.
    @Modifying
    @Query(value = """
            INSERT INTO proxy_usage (user_id, usage_date, request_count)
            VALUES (:userId, :usageDate, 1)
            ON CONFLICT (user_id, usage_date)
            DO UPDATE SET request_count = proxy_usage.request_count + 1
            """, nativeQuery = true)
    void increment(@Param("userId") UUID userId, @Param("usageDate") LocalDate usageDate);

    @Query(value = """
            SELECT COALESCE((SELECT request_count FROM proxy_usage
                             WHERE user_id = :userId AND usage_date = :usageDate), 0)
            """, nativeQuery = true)
    int countForUser(@Param("userId") UUID userId, @Param("usageDate") LocalDate usageDate);

    // Ліміти Gemini діють на ПРОЄКТ, тому крім персональної квоти треба знати
    // сумарну за добу по всіх користувачах.
    @Query(value = "SELECT COALESCE(SUM(request_count), 0) FROM proxy_usage WHERE usage_date = :usageDate",
            nativeQuery = true)
    long countForAll(@Param("usageDate") LocalDate usageDate);
}
