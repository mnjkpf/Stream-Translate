package com.streamtranslate.backend.translate;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.streamtranslate.backend.auth.CurrentUser;
import com.streamtranslate.backend.translate.dto.QuotaResponse;
import com.streamtranslate.backend.translate.dto.TranslateRequest;
import com.streamtranslate.backend.translate.dto.TranslateResponse;

import jakarta.validation.Valid;

// Проксі-переклад вбудованим ключем. Потребує JWT — інакше не було б кого
// рахувати в квоті, і ендпоінт став би анонімним безкоштовним Gemini.
@RestController
@RequestMapping("/translate")
public class TranslateController {

    private final TranslateService translateService;

    public TranslateController(TranslateService translateService) {
        this.translateService = translateService;
    }

    @PostMapping
    public TranslateResponse translate(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody TranslateRequest request) {
        return translateService.translate(CurrentUser.id(jwt), request);
    }

    @GetMapping("/quota")
    public QuotaResponse quota(@AuthenticationPrincipal Jwt jwt) {
        return translateService.quota(CurrentUser.id(jwt));
    }

    // ── Помилки → осмислені статуси замість голого 500 ───────────────────────

    @ExceptionHandler(QuotaExceededException.class)
    public ResponseEntity<Map<String, String>> onQuota(QuotaExceededException e) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(Map.of("code", e.getCode(), "message", e.getMessage()));
    }

    @ExceptionHandler(ProxyUnavailableException.class)
    public ResponseEntity<Map<String, String>> onUnavailable(ProxyUnavailableException e) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("code", "PROXY_DISABLED", "message", e.getMessage()));
    }

    @ExceptionHandler(GeminiException.class)
    public ResponseEntity<Map<String, String>> onGemini(GeminiException e) {
        // 429 від самого Gemini = квота проєкту скінчилася раніше, ніж спрацювали
        // наші лічильники (напр. ключ використовують і поза цим сервісом).
        // Клієнту це той самий сигнал, що й GLOBAL_QUOTA.
        if (e.getUpstreamStatus() == 429) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("code", "GLOBAL_QUOTA",
                            "message", "Ліміт перекладів вичерпано. Спробуйте пізніше або перейдіть на свій ключ."));
        }
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(Map.of("code", "UPSTREAM_ERROR", "message", e.getMessage()));
    }
}
