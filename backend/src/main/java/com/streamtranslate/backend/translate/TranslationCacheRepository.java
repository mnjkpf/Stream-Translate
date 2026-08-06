package com.streamtranslate.backend.translate;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TranslationCacheRepository extends JpaRepository<TranslationCacheEntry, String> {
}
