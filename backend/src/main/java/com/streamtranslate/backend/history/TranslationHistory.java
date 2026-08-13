package com.streamtranslate.backend.history;

import java.time.Instant;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;

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

// Один запис історії = один переклад, зроблений користувачем.
// На відміну від saved_words, тут немає унікальності: те саме слово, перекладене
// двічі, — це дві окремі події, і саме з них будується графік активності.
@Entity
@Table(name = "translation_history")
@Getter
@Setter
public class TranslationHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private Users user;

    @Column(nullable = false, length = 500)
    private String text;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String translation;

    @Column(nullable = false, length = 16)
    private String mode;

    @Column(name = "source_lang", nullable = false, length = 32)
    private String sourceLang;

    @Column(name = "target_lang", nullable = false, length = 32)
    private String targetLang;

    @Column(name = "source_url", columnDefinition = "TEXT")
    private String sourceUrl;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
