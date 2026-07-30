package com.streamtranslate.backend.auth;

import java.util.UUID;

import org.springframework.security.oauth2.jwt.Jwt;

// Наш JWT кладе user.id у claim "sub" (JwtService.issueToken). Контролери дістають Jwt через
// @AuthenticationPrincipal і тягнуть з нього id цим хелпером, замість дублювати UUID.fromString(...) всюди.
public final class CurrentUser {

    private CurrentUser() {
    }

    public static UUID id(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
