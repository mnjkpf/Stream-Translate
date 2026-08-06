package com.streamtranslate.backend.history;

import java.util.List;
import java.util.Map;

import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.streamtranslate.backend.auth.CurrentUser;
import com.streamtranslate.backend.history.dto.HistoryRequest;
import com.streamtranslate.backend.history.dto.HistoryResponse;
import com.streamtranslate.backend.history.dto.StatsPoint;

import jakarta.validation.Valid;

// Історія перекладів і агрегати для графіка. user_id завжди з JWT.
@RestController
public class HistoryController {

    private final HistoryService historyService;

    public HistoryController(HistoryService historyService) {
        this.historyService = historyService;
    }

    @PostMapping("/history")
    @ResponseStatus(HttpStatus.CREATED)
    public HistoryResponse record(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody HistoryRequest request) {
        return historyService.record(CurrentUser.id(jwt), request);
    }

    // Пагінація обов'язкова: за 90 днів активного користування історія — це
    // тисячі рядків, і віддавати їх одним списком не можна.
    @GetMapping("/history")
    public Map<String, Object> list(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        Page<HistoryResponse> result = historyService.list(CurrentUser.id(jwt), query, page, size);
        return Map.of(
                "items", result.getContent(),
                "page", result.getNumber(),
                "totalPages", result.getTotalPages(),
                "totalItems", result.getTotalElements());
    }

    @GetMapping("/stats")
    public List<StatsPoint> stats(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "30") int days) {
        return historyService.stats(CurrentUser.id(jwt), days);
    }
}
