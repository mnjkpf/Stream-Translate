package com.streamtranslate.backend.auth.google;

// Дані, які GoogleTokenVerifier дістає з валідного Google ID-токена.
// Використовується контролером /auth/google: за googleSub шукаємо/створюємо Users,
// а вже для Users видаємо ВЛАСНИЙ JWT (Google-токен далі ніде не зберігається і не використовується).
public record GoogleUser(
        String sub,   // claim "sub" — стабільний унікальний ID акаунта Google, мапиться на Users.googleSub
        String email, // claim "email" — присутній, бо Google Sign-In запитує scope email
        String name   // claim "name" — присутній, бо Google Sign-In запитує scope profile
) {
}
