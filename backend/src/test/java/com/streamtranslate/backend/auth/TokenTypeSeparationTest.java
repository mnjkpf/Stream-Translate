package com.streamtranslate.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.web.server.ResponseStatusException;

import com.streamtranslate.backend.TestcontainersConfiguration;
import com.streamtranslate.backend.user.UserRepository;
import com.streamtranslate.backend.user.Users;

// Розділення access і refresh (claim "type").
//
// До цього обидва токени були структурно однаковими, і кожен приймався замість
// іншого. Ці тести фіксують обидві половини фікса, бо жодна з них не видна
// у звичайному сценарії — усе працює й без них, поки токен не вкрадуть.
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class TokenTypeSeparationTest {

    @Autowired
    private JwtService jwtService;

    @Autowired
    private UserRepository userRepository;

    private Users persistUser(String sub) {
        Users user = new Users();
        user.setGoogleSub(sub);
        user.setEmail(sub + "@example.com");
        user.setDisplayName("Test");
        return userRepository.save(user);
    }

    @Test
    void refreshTokenIsAcceptedWhereRefreshIsExpected() {
        Users user = persistUser("type-sub-1");
        String refresh = jwtService.issueRefresh(user);

        UUID parsed = jwtService.parseUserId(refresh, TokenType.REFRESH);

        assertThat(parsed).isEqualTo(user.getId());
    }

    // Головний випадок: вкрадений access не можна нескінченно продовжувати
    // через /auth/refresh, обмінюючи на новий.
    @Test
    void accessTokenIsRejectedWhereRefreshIsExpected() {
        Users user = persistUser("type-sub-2");
        String access = jwtService.issueAccess(user);

        assertThatThrownBy(() -> jwtService.parseUserId(access, TokenType.REFRESH))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("401");
    }

    @Test
    void garbageTokenGives401NotServerError() {
        assertThatThrownBy(() -> jwtService.parseUserId("not-a-jwt", TokenType.REFRESH))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("401");
    }

    // Токени підписуються так, щоб тип узагалі був присутній — інакше перевірка
    // в декодері (SecurityConfig) не мала б що звіряти.
    @Test
    void issuedTokensCarryTheirType() {
        Users user = persistUser("type-sub-3");

        assertThat(jwtService.parseUserId(jwtService.issueAccess(user), TokenType.ACCESS))
                .isEqualTo(user.getId());
        assertThat(jwtService.parseUserId(jwtService.issueRefresh(user), TokenType.REFRESH))
                .isEqualTo(user.getId());
    }
}
