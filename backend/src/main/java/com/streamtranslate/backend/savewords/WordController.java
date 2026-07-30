package com.streamtranslate.backend.savewords;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.streamtranslate.backend.auth.CurrentUser;
import com.streamtranslate.backend.savewords.dto.SyncRequest;
import com.streamtranslate.backend.savewords.dto.SyncResponse;
import com.streamtranslate.backend.savewords.dto.WordRequest;
import com.streamtranslate.backend.savewords.dto.WordResponse;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

// Усі ендпоінти під authenticated (SecurityConfig): user_id завжди береться з JWT (CurrentUser.id),
// ніколи з тіла запиту чи path — інакше юзер міг би підмінити userId і залізти в чужі дані.
@RestController
@RequestMapping("/words")
@RequiredArgsConstructor
public class WordController {

    private final WordService wordService;

    @GetMapping
    public List<WordResponse> findAll(@AuthenticationPrincipal Jwt jwt) {
        return wordService.findAll(CurrentUser.id(jwt));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public WordResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody WordRequest request) {
        return wordService.create(CurrentUser.id(jwt), request);
    }

    @PutMapping("/{id}")
    public WordResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @Valid @RequestBody WordRequest request) {
        return wordService.update(CurrentUser.id(jwt), id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        wordService.delete(CurrentUser.id(jwt), id);
    }

    @PostMapping("/sync")
    public SyncResponse sync(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SyncRequest request) {
        return wordService.sync(CurrentUser.id(jwt), request);
    }
}
