package com.streamtranslate.backend.savewords.dto;

import java.time.Instant;
import java.util.List;

public record SyncResponse(
        List<WordResponse> serverChanges,
        Instant serverTime
) {
}
