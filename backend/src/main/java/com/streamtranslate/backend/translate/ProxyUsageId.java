package com.streamtranslate.backend.translate;

import java.io.Serializable;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;

// Складений ключ для ProxyUsage. JPA вимагає, щоб @IdClass був Serializable
// і мав equals/hashCode — саме за ними Hibernate розрізняє сутності в кеші
// персистентності, тож record тут не підійде (потрібен no-args конструктор).
public class ProxyUsageId implements Serializable {

    private UUID userId;
    private LocalDate usageDate;

    public ProxyUsageId() {
    }

    public ProxyUsageId(UUID userId, LocalDate usageDate) {
        this.userId = userId;
        this.usageDate = usageDate;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ProxyUsageId other)) return false;
        return Objects.equals(userId, other.userId) && Objects.equals(usageDate, other.usageDate);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId, usageDate);
    }
}
