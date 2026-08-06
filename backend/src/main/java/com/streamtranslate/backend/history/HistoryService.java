package com.streamtranslate.backend.history;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.streamtranslate.backend.history.dto.HistoryRequest;
import com.streamtranslate.backend.history.dto.HistoryResponse;
import com.streamtranslate.backend.history.dto.StatsPoint;
import com.streamtranslate.backend.savewords.SavedWordsRepository;
import com.streamtranslate.backend.user.UserRepository;

@Service
public class HistoryService {

    // Стеля на запит періоду. Без неї ?days=100000 змусив би БД сканувати все
    // й повернути десятки тисяч точок, з яких графік однаково намалює 90.
    private static final int MAX_DAYS = 365;

    private final TranslationHistoryRepository historyRepository;
    private final SavedWordsRepository savedWordsRepository;
    private final UserRepository userRepository;

    public HistoryService(TranslationHistoryRepository historyRepository,
            SavedWordsRepository savedWordsRepository,
            UserRepository userRepository) {
        this.historyRepository = historyRepository;
        this.savedWordsRepository = savedWordsRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public HistoryResponse record(UUID userId, HistoryRequest request) {
        TranslationHistory entry = new TranslationHistory();
        entry.setUser(userRepository.getReferenceById(userId));
        entry.setText(request.text());
        entry.setTranslation(request.translation());
        entry.setMode(request.mode());
        entry.setSourceLang(request.sourceLang());
        entry.setTargetLang(request.targetLang());
        entry.setSourceUrl(request.sourceUrl());
        return HistoryResponse.from(historyRepository.save(entry));
    }

    @Transactional(readOnly = true)
    public Page<HistoryResponse> list(UUID userId, String query, int page, int size) {
        PageRequest pageable = PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 100));
        Page<TranslationHistory> found = (query == null || query.isBlank())
                ? historyRepository.findByUser_IdOrderByCreatedAtDesc(userId, pageable)
                : historyRepository.search(userId, query.trim(), pageable);
        return found.map(HistoryResponse::from);
    }

    // Дві серії для графіка. Обидві рахуються агрегатами в SQL, а тут лише
    // зшиваються по днях і доповнюються нулями за дні без активності.
    @Transactional(readOnly = true)
    public List<StatsPoint> stats(UUID userId, int days) {
        int window = Math.min(Math.max(1, days), MAX_DAYS);
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        LocalDate from = today.minusDays(window - 1L);
        Instant since = from.atStartOfDay(ZoneOffset.UTC).toInstant();

        Map<LocalDate, Long> translations = toMap(historyRepository.countByDay(userId, since));
        Map<LocalDate, Long> words = toMap(savedWordsRepository.countByDay(userId, since));

        List<StatsPoint> points = new ArrayList<>(window);
        for (long i = 0; i < window; i++) {
            LocalDate day = from.plusDays(i);
            points.add(new StatsPoint(day,
                    translations.getOrDefault(day, 0L),
                    words.getOrDefault(day, 0L)));
        }
        return points;
    }

    private static Map<LocalDate, Long> toMap(List<TranslationHistoryRepository.DailyCount> rows) {
        Map<LocalDate, Long> map = new HashMap<>();
        for (TranslationHistoryRepository.DailyCount row : rows) {
            map.put(row.getDay().toLocalDate(), row.getTotal());
        }
        return map;
    }

    // Використовується завданням очищення (HistoryRetentionJob).
    @Transactional
    public int deleteOlderThan(int retentionDays) {
        Instant cutoff = Instant.now().minus(retentionDays, ChronoUnit.DAYS);
        return historyRepository.deleteOlderThan(cutoff);
    }
}
