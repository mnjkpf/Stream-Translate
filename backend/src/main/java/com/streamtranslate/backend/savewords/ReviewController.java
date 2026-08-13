package com.streamtranslate.backend.savewords;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.streamtranslate.backend.auth.CurrentUser;
import com.streamtranslate.backend.savewords.dto.ReviewCountResponse;
import com.streamtranslate.backend.savewords.dto.ReviewRequest;
import com.streamtranslate.backend.savewords.dto.WordResponse;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

// Ендпоінти інтервального повторення. Захищені автоматично: SecurityConfig має
// .anyRequest().authenticated(), тож для нових шляхів окреме правило не потрібне.
@RestController
@RequestMapping("/review")
@RequiredArgsConstructor
public class ReviewController {

    private final ReviewService reviewService;

    @GetMapping("/due")
    public List<WordResponse> due(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "20") int limit) {
        return reviewService.queue(CurrentUser.id(jwt), limit);
    }

    @PostMapping("/{id}")
    public WordResponse review(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @Valid @RequestBody ReviewRequest request) {
        return reviewService.review(CurrentUser.id(jwt), id, request.grade());
    }

    @GetMapping("/count")
    public ReviewCountResponse count(@AuthenticationPrincipal Jwt jwt) {
        return reviewService.count(CurrentUser.id(jwt));
    }
}
