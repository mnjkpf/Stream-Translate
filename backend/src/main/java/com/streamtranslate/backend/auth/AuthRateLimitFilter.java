package com.streamtranslate.backend.auth;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

// Обмеження частоти запитів до /auth/**.
//
// Навіщо саме тут: це ЄДИНІ ендпоінти, доступні без токена. Решта API закрита
// автентифікацією, тобто вже має природний бар'єр. А /auth/google на кожен виклик
// іде перевіряти підпис у Google (мережевий запит + криптографія), тож потік
// запитів звідти дорого коштує навіть без жодного успішного логіну.
//
// Реалізація свідомо проста — лічильник у пам'яті з фіксованим вікном, без
// Bucket4j і Redis. Причини: інстанс один, залежностей не додаємо, а точність на
// межі вікна тут не має значення (різниця між 20 і 40 спробами за хвилину
// нікого не рятує й не карає). Якщо інстансів стане кілька, ліміт стане
// «на інстанс» — тоді й буде привід брати спільне сховище.
@Component
@Order(1) // раніше за ланцюжки Spring Security: немає сенсу валідувати те, що вже відкинуто
public class AuthRateLimitFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(AuthRateLimitFilter.class);

    private static final Duration WINDOW = Duration.ofMinutes(1);

    // Стеля на кількість різних IP у пам'яті. Без неї потік запитів з підробленими
    // адресами роздув би мапу — тобто сам захист став би вектором вичерпання пам'яті.
    private static final int MAX_TRACKED_CLIENTS = 10_000;

    private final int maxRequests;
    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    public AuthRateLimitFilter(@Value("${app.auth.rate-limit-per-minute:20}") int maxRequests) {
        this.maxRequests = maxRequests;
    }

    // Фільтр працює лише на /auth/**; для решти шляхів Spring його навіть не викликає.
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/auth/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {

        if (isAllowed(clientKey(request))) {
            chain.doFilter(request, response);
            return;
        }

        log.warn("Перевищено ліміт запитів до {} з {}", request.getRequestURI(), clientKey(request));
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"error\":\"Забагато спроб, зачекайте хвилину\"}");
    }

    private boolean isAllowed(String key) {
        Instant now = Instant.now();

        // Мапа чиститься ліниво, при переповненні: окремий планувальник заради
        // словника на кілька тисяч записів був би надлишковим.
        if (windows.size() > MAX_TRACKED_CLIENTS) {
            windows.entrySet().removeIf(e -> e.getValue().isExpired(now));
        }

        Window window = windows.compute(key, (k, existing) ->
                (existing == null || existing.isExpired(now)) ? new Window(now) : existing);

        return window.count.incrementAndGet() <= maxRequests;
    }

    // За проксі Railway реальний IP приходить у X-Forwarded-For, а getRemoteAddr()
    // повертає адресу самого проксі — без цього ліміт був би спільним для всіх
    // користувачів одразу. Заголовок можна підробити, але для нашої мети (зробити
    // перебір дорожчим) цього достатньо; надійне рішення потребувало б довіри до
    // конкретного проксі, а він тут не наш.
    private static String clientKey(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            // Заголовок може містити ланцюжок "клієнт, проксі1, проксі2" — беремо перший.
            int comma = forwarded.indexOf(',');
            return (comma > 0 ? forwarded.substring(0, comma) : forwarded).trim();
        }
        return request.getRemoteAddr();
    }

    private static final class Window {
        private final Instant startedAt;
        private final AtomicInteger count = new AtomicInteger();

        private Window(Instant startedAt) {
            this.startedAt = startedAt;
        }

        private boolean isExpired(Instant now) {
            return startedAt.plus(WINDOW).isBefore(now);
        }
    }
}
