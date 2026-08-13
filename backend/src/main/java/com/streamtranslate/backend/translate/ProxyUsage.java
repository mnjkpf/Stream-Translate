package com.streamtranslate.backend.translate;

import java.time.LocalDate;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

// Скільки проксі-перекладів зробив користувач за конкретну добу.
// Складений ключ (user_id, usage_date) — окремого сурогатного id не треба:
// пара «юзер + доба» і є природним ключем, а зайвий UUID лише дав би змогу
// існувати двом рядкам на ту саму добу.
//
// Саме інкрементування робиться нативним UPSERT'ом у репозиторії, а не
// read-modify-write через цю сутність — див. коментар там.
@Entity
@Table(name = "proxy_usage")
@IdClass(ProxyUsageId.class)
@Getter
@Setter
public class ProxyUsage {

    @Id
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Id
    @Column(name = "usage_date", nullable = false)
    private LocalDate usageDate;

    @Column(name = "request_count", nullable = false)
    private int requestCount;
}
