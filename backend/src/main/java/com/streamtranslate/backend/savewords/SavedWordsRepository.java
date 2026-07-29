package com.streamtranslate.backend.savewords;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SavedWordsRepository extends JpaRepository<UUID,SavedWords>{
    List<SavedWords> findByUser_Id(UUID userId);

    List<SavedWords> findByUserIdAndUpdatedAtAfter(UUID userId, Instant since);

    Optional<SavedWords> findByIdAndUser_Id(UUID id, UUID userId);
}
