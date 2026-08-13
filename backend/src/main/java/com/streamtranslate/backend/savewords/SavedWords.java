package com.streamtranslate.backend.savewords;

import java.time.Instant;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import com.streamtranslate.backend.user.Users;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "saved_words")
@Getter
@Setter
public class SavedWords {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private Users user;

    @Column(nullable = false, length = 255)
    private String text;

    @Column(nullable = false, length = 255)
    private String lemma;

    @Column(length = 32)
    private String pos;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String translation;

    @Column(columnDefinition = "TEXT")
    private String example;

    @Column(name = "source_lang", nullable = false, length = 16)
    private String sourceLang;

    @Column(name = "target_lang", nullable = false, length = 16)
    private String targetLang;

    @Column(columnDefinition = "TEXT")
    private String context;

    @Column(name = "source_url", columnDefinition = "TEXT")
    private String sourceUrl;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // ── Стан інтервальних повторень (V7) ────────────────────────────────────
    // Без columnDefinition: схемою керує Flyway, а Hibernate лише звіряє її
    // (ddl-auto=validate) і ці атрибути не використовує взагалі. Тримати тут
    // ще один опис колонки означало б дві версії правди, які мовчки розійдуться.
    @Column(name = "srs_level", nullable = false)
    private int srsLevel;

    // Ініціалізація саме тут, а не в WordService: Hibernate у INSERT перелічує
    // всі колонки, тож null у полі пішов би в БД явним NULL і DEFAULT NOW()
    // з міграції не спрацював би — вставка падала б на NOT NULL. Значення в полі
    // закриває одразу обидва шляхи створення слова (create і гілку нового слова
    // в sync), тож жоден із них не можна забути.
    @Column(name = "due_at", nullable = false)
    private Instant dueAt = Instant.now();

    @Column(name = "lapses", nullable = false)
    private int lapses;

    // nullable: NULL тут означає «жодного разу не повторювалось».
    @Column(name = "reviewed_at")
    private Instant reviewedAt;
}
