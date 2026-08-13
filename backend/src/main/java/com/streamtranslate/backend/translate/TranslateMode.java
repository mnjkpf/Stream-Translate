package com.streamtranslate.backend.translate;

import com.fasterxml.jackson.annotation.JsonCreator;

// Режими перекладу, ті самі, що в розширенні (src/content/overlay/translate.ts).
// Enum, а не рядок: невідомий режим має відсіктися валідацією запиту, а не
// дійти до PromptBuilder і впасти там.
public enum TranslateMode {
    WORD,
    PHRASE,
    SENTENCE;

    // Клієнт шле "word"/"phrase"/"sentence" у нижньому регістрі.
    @JsonCreator
    public static TranslateMode from(String value) {
        return TranslateMode.valueOf(value.trim().toUpperCase());
    }
}
