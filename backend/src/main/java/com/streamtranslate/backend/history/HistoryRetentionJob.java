package com.streamtranslate.backend.history;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

// Автовидалення старої історії.
//
// Це не оптимізація місця, а вимога приватності: історія показує, що людина
// дивилась і коли. Тримати її вічно немає підстав, а при запиті на видалення
// даних (GDPR) обмежений строк різко спрощує відповідь.
//
// Один інстанс — тому звичайний @Scheduled без розподіленого блокування.
// Якщо колись з'явиться кілька інстансів, завдання виконається на кожному;
// для DELETE це безпечно (ідемпотентно), але варто буде додати ShedLock.
@Component
public class HistoryRetentionJob {

    private static final Logger log = LoggerFactory.getLogger(HistoryRetentionJob.class);

    private final HistoryService historyService;
    private final int retentionDays;

    public HistoryRetentionJob(HistoryService historyService,
            @Value("${app.history.retention-days:90}") int retentionDays) {
        this.historyService = historyService;
        this.retentionDays = retentionDays;
    }

    // Щодня о 03:30 — поза піком використання.
    @Scheduled(cron = "0 30 3 * * *")
    public void purgeOldHistory() {
        int deleted = historyService.deleteOlderThan(retentionDays);
        if (deleted > 0) {
            log.info("Історія: видалено {} записів, старших за {} днів", deleted, retentionDays);
        }
    }
}
