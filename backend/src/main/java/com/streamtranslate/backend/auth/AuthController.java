package com.streamtranslate.backend.auth;

import java.util.UUID;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.streamtranslate.backend.auth.dto.GoogleLoginRequest;
import com.streamtranslate.backend.auth.dto.RefreshRequest;
import com.streamtranslate.backend.auth.dto.TokenResponse;
import com.streamtranslate.backend.auth.google.GoogleTokenVerifier;
import com.streamtranslate.backend.auth.google.GoogleUser;
import com.streamtranslate.backend.user.UserRepository;
import com.streamtranslate.backend.user.Users;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

// Єдине місце в застосунку, де Google-токен взагалі щось означає (через GoogleTokenVerifier).
// Обидва ендпоінти видають лише НАШІ токени — далі про Google ніхто інший не знає.
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final GoogleTokenVerifier googleTokenVerifier;
    private final UserRepository userRepository;
    private final JwtService jwtService;

    // Обмін Google ID-токена на нашу пару access+refresh.
    @PostMapping("/google")
    public TokenResponse loginWithGoogle(@Valid @RequestBody GoogleLoginRequest request) {
        GoogleUser googleUser = googleTokenVerifier.verify(request.idToken()); // кине JwtException, якщо токен недійсний

        Users user = userRepository.findByGoogleSub(googleUser.sub()).orElseGet(Users::new);
        user.setGoogleSub(googleUser.sub());
        user.setEmail(googleUser.email());       // upsert: email/ім'я в Google могли змінитися з минулого разу
        user.setDisplayName(googleUser.name());
        Users savedUser = userRepository.save(user); // для нового user'а тут генерується id (потрібен нижче для sub)

        return new TokenResponse(jwtService.issueAccess(savedUser), jwtService.issueRefresh(savedUser));
    }

    // Обмін ще дійсного refresh-токена на новий access. Сам refresh не оновлюємо — клієнт
    // продовжує користуватись тим самим, поки він не протермінується.
    @PostMapping("/refresh")
    public TokenResponse refresh(@Valid @RequestBody RefreshRequest request) {
        UUID userId = jwtService.parseUserId(request.refreshToken());
        Users user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalStateException("Користувача з refresh-токена не знайдено: " + userId));

        return new TokenResponse(jwtService.issueAccess(user), request.refreshToken());
    }
}
