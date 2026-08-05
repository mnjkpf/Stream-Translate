package com.streamtranslate.backend.user;

import java.util.HashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.streamtranslate.backend.auth.CurrentUser;
import com.streamtranslate.backend.user.dto.MeResponse;
import com.streamtranslate.backend.user.dto.SettingsUpdateRequest;

// Профіль + налаштування поточного користувача. user_id завжди з JWT (CurrentUser.id).
// УВАГА: settings можуть містити apiKey (ключ Gemini користувача) — зберігаємо його
// в JSONB як є. TODO(безпека): шифрувати at-rest, якщо/коли з'явиться кілька користувачів.
@RestController
@RequestMapping("/me")
public class MeController {

    private final UserRepository userRepository;

    public MeController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public MeResponse me(@AuthenticationPrincipal Jwt jwt) {
        return MeResponse.from(currentUser(jwt));
    }

    @PutMapping("/settings")
    @Transactional
    public MeResponse updateSettings(@AuthenticationPrincipal Jwt jwt,
            @RequestBody SettingsUpdateRequest request) {
        Users user = currentUser(jwt);

        // Копіюємо в НОВУ мапу і мержимо лише не-null поля (щоб оновлення одного не
        // затирало решти). Реассайн, а не мутація на місці — так Hibernate гарантовано
        // помічає зміну JSONB-поля незалежно від mutability-плану JSON-типу.
        Map<String, String> settings = new HashMap<>(user.getSettings());
        putIfPresent(settings, "apiKey", request.apiKey());
        putIfPresent(settings, "sourceLang", request.sourceLang());
        putIfPresent(settings, "targetLang", request.targetLang());
        putIfPresent(settings, "model", request.model());
        user.setSettings(settings);

        return MeResponse.from(userRepository.save(user));
    }

    private static void putIfPresent(Map<String, String> settings, String key, String value) {
        if (value != null) {
            settings.put(key, value);
        }
    }

    private Users currentUser(Jwt jwt) {
        return userRepository.findById(CurrentUser.id(jwt))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Користувача не знайдено"));
    }
}
