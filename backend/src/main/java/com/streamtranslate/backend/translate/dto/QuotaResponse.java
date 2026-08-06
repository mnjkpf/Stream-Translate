package com.streamtranslate.backend.translate.dto;

// Стан денної квоти вбудованого ключа — для рядка «Залишилось сьогодні: N з M»
// у профілі розширення.
//
// enabled=false означає, що проксі вимкнений або серверний ключ не налаштований:
// UI має показати це як «недоступно», а не як «0 залишилось» — це різні стани,
// і в другому користувач марно чекав би завтрашнього скидання.
public record QuotaResponse(
        boolean enabled,
        int used,
        int limit,
        int remaining
) {
}
