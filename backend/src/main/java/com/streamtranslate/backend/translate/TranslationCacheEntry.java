package com.streamtranslate.backend.translate;

import java.time.Instant;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

// Спільний для всіх користувачів кеш перекладів. Однакові слова повторюються
// між людьми постійно, тож попадання в кеш не витрачає квоту Gemini — це
// головний важіль, щоб лишатися в межах безкоштовного тарифу.
//
// Приватність: рядок не прив'язаний до користувача. Оригінал і контекст
// зберігаються лише як хеш у ключі, назовні лежить сам переклад.
@Entity
@Table(name = "translation_cache")
@Getter
@Setter
public class TranslationCacheEntry {

    @Id
    @Column(name = "cache_key", nullable = false, length = 64)
    private String cacheKey;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String translation;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
