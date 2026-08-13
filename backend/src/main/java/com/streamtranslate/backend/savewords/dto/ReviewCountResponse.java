package com.streamtranslate.backend.savewords.dto;

// Бейдж кількості карток на дашборді (GET /review/count). Імена полів мають
// збігатися точно з ReviewCount на клієнті (backendAuth.ts) — розширення читає їх напряму.
public record ReviewCountResponse(
        long due,
        long total,
        long mastered
) {
}
