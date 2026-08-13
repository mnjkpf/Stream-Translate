package com.streamtranslate.backend.translate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.streamtranslate.backend.TestcontainersConfiguration;
import com.streamtranslate.backend.translate.dto.TranslateRequest;
import com.streamtranslate.backend.translate.dto.TranslateResponse;
import com.streamtranslate.backend.user.UserRepository;
import com.streamtranslate.backend.user.Users;

// GeminiClient замоканий: тести перевіряють НАШУ логіку (квоти, кеш), а не
// доступність зовнішнього API — інакше вони залежали б від мережі й витрачали квоту.
@SpringBootTest(properties = {
        "app.proxy.enabled=true",
        "app.proxy.daily-per-user=3",
        "app.proxy.daily-global=5"
})
@Import(TestcontainersConfiguration.class)
class TranslateServiceTest {

    private static final ZoneId QUOTA_ZONE = ZoneId.of("America/Los_Angeles");

    @Autowired
    private TranslateService translateService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ProxyUsageRepository usageRepository;

    @Autowired
    private TranslationCacheRepository cacheRepository;

    @MockitoBean
    private GeminiClient geminiClient;

    private TranslateRequest request(String text) {
        return new TranslateRequest(text, "some context", TranslateMode.WORD, "English", "Ukrainian");
    }

    private Users newUser() {
        Users user = new Users();
        user.setGoogleSub("sub-" + UUID.randomUUID());
        user.setEmail(UUID.randomUUID() + "@example.com");
        return userRepository.saveAndFlush(user);
    }

    @Test
    void translatesAndCountsAgainstTheDailyQuota() {
        when(geminiClient.isConfigured()).thenReturn(true);
        when(geminiClient.generate(anyString(), anyString())).thenReturn("переклад");

        Users user = newUser();
        TranslateResponse response = translateService.translate(user.getId(), request("apex-" + UUID.randomUUID()));

        assertThat(response.translation()).isEqualTo("переклад");
        assertThat(response.cached()).isFalse();
        assertThat(response.remaining()).isEqualTo(2); // ліміт 3, витрачено 1
        assertThat(usageRepository.countForUser(user.getId(), LocalDate.now(QUOTA_ZONE))).isEqualTo(1);
    }

    @Test
    void servesRepeatFromSharedCacheWithoutSpendingQuota() {
        when(geminiClient.isConfigured()).thenReturn(true);
        when(geminiClient.generate(anyString(), anyString())).thenReturn("переклад");

        Users first = newUser();
        String text = "cache-" + UUID.randomUUID();
        translateService.translate(first.getId(), request(text));

        // Інший користувач, те саме слово: кеш спільний, тож Gemini не викликається
        // вдруге і квота другого юзера лишається недоторканою.
        Users second = newUser();
        TranslateResponse cached = translateService.translate(second.getId(), request(text));

        assertThat(cached.cached()).isTrue();
        assertThat(cached.translation()).isEqualTo("переклад");
        assertThat(usageRepository.countForUser(second.getId(), LocalDate.now(QUOTA_ZONE))).isZero();
    }

    @Test
    void rejectsWithUserQuotaCodeOncePersonalLimitIsReached() {
        when(geminiClient.isConfigured()).thenReturn(true);
        when(geminiClient.generate(anyString(), anyString())).thenReturn("переклад");

        Users user = newUser();
        for (int i = 0; i < 3; i++) { // ліміт на юзера = 3
            translateService.translate(user.getId(), request("word-" + UUID.randomUUID()));
        }

        assertThatThrownBy(() -> translateService.translate(user.getId(), request("over-" + UUID.randomUUID())))
                .isInstanceOf(QuotaExceededException.class)
                .extracting(e -> ((QuotaExceededException) e).getCode())
                .isEqualTo("USER_QUOTA");
    }

    @Test
    void reportsUnavailableWhenServerKeyIsMissing() {
        when(geminiClient.isConfigured()).thenReturn(false);

        Users user = newUser();
        assertThatThrownBy(() -> translateService.translate(user.getId(), request("any")))
                .isInstanceOf(ProxyUnavailableException.class);

        verify(geminiClient, never()).generate(anyString(), anyString());
        assertThat(translateService.quota(user.getId()).enabled()).isFalse();
    }

    @Test
    void cacheKeyIgnoresLetterCaseButNotLanguagePair() {
        String lower = TranslateService.cacheKey(TranslateMode.WORD, "English", "Ukrainian", "Apex", "ctx");
        String upper = TranslateService.cacheKey(TranslateMode.WORD, "English", "Ukrainian", "APEX", "ctx");
        String otherTarget = TranslateService.cacheKey(TranslateMode.WORD, "English", "Polish", "Apex", "ctx");

        assertThat(lower).isEqualTo(upper);
        assertThat(lower).isNotEqualTo(otherTarget);
    }
}
