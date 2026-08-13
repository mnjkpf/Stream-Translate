package com.streamtranslate.backend.translate;

import java.time.Duration;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

// Виклик Gemini СЕРВЕРНИМ ключем (режим «вбудований ключ»).
// Ключ приходить зі змінної середовища GEMINI_API_KEY і нікуди звідси не виходить:
// у відповідь клієнтові йде лише готовий переклад.
@Component
public class GeminiClient {

    private static final String BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

    // Без таймаутів зависла відповідь Gemini тримала б потік і запит клієнта
    // нескінченно — на віртуальних потоках це не впало б, але tooltip у юзера
    // назавжди лишився б на «Перекладаю…».
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(20);

    private final RestClient restClient;
    private final String apiKey;

    public GeminiClient(@Value("${app.gemini.api-key:}") String apiKey) {
        this.apiKey = apiKey;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(CONNECT_TIMEOUT);
        factory.setReadTimeout(READ_TIMEOUT);

        this.restClient = RestClient.builder()
                .baseUrl(BASE_URL)
                .requestFactory(factory)
                .build();
    }

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    // Повертає готовий текст перекладу. Кидає GeminiException — сервіс вище
    // мапить її у зрозумілий клієнтові статус, а не в голий 500.
    public String generate(String model, String prompt) {
        GeminiResponse response;
        try {
            response = restClient.post()
                    .uri("/models/{model}:generateContent", model)
                    // Ключ у заголовку, а не в query — секрети в URL осідають
                    // у логах проксі та в історії редіректів.
                    .header("x-goog-api-key", apiKey)
                    .body(new GeminiRequest(
                            List.of(new Content(List.of(new Part(prompt)))),
                            new GenerationConfig(0.2, 500)))
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (req, res) -> {
                        throw new GeminiException(res.getStatusCode().value(),
                                "Gemini відповів " + res.getStatusCode().value());
                    })
                    .body(GeminiResponse.class);
        } catch (GeminiException e) {
            throw e;
        } catch (RestClientException e) {
            // Таймаут, DNS, обрив з'єднання — для клієнта це «сервіс тимчасово недоступний».
            throw new GeminiException(503, "Не вдалося звернутися до Gemini: " + e.getMessage());
        }

        String text = extractText(response);
        if (text == null || text.isBlank()) {
            throw new GeminiException(502, "Порожня відповідь від Gemini");
        }
        return text.trim();
    }

    private static String extractText(GeminiResponse response) {
        if (response == null || response.candidates() == null || response.candidates().isEmpty()) return null;
        Content content = response.candidates().get(0).content();
        if (content == null || content.parts() == null || content.parts().isEmpty()) return null;
        return content.parts().get(0).text();
    }

    // Мінімальні DTO під формат Gemini. Невідомі поля відповіді Spring Boot
    // ігнорує за замовчуванням, тож описувати всю схему не треба.
    private record GeminiRequest(List<Content> contents, GenerationConfig generationConfig) {
    }

    private record GenerationConfig(double temperature, int maxOutputTokens) {
    }

    private record Content(List<Part> parts) {
    }

    private record Part(String text) {
    }

    private record Candidate(Content content) {
    }

    private record GeminiResponse(List<Candidate> candidates) {
    }
}
