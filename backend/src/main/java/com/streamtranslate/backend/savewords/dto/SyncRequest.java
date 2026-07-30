package com.streamtranslate.backend.savewords.dto;

import java.time.Instant;
import java.util.List;

import jakarta.validation.Valid;

// since == null -> перший sync клієнта, серверна дельта повертається за весь час.
public record SyncRequest(
        Instant since,
        @Valid List<WordChange> changes
) {
}
