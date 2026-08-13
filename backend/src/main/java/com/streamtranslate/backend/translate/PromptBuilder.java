package com.streamtranslate.backend.translate;

// Промпти будуються ТУТ, із структурованих полів запиту.
//
// Це межа безпеки, а не просто організація коду: якби ендпоінт приймав готовий
// текст промпту від клієнта, будь-хто перетворив би проксі на безкоштовний
// чат загального призначення за рахунок власника ключа. Приймаючи лише
// {text, context, mode, мови}, ми обмежуємо застосування ключа перекладом.
//
// Дзеркалить промпти клієнта (src/background/index.js) для режиму «свій ключ» —
// щоб переклад був однаковим незалежно від того, чий ключ використано.
final class PromptBuilder {

    private PromptBuilder() {
    }

    static String build(TranslateMode mode, String text, String context, String sourceLang, String targetLang) {
        return switch (mode) {
            case WORD -> """
                    You are a dictionary translator helping someone learn %s.

                    Word: "%s"
                    Sentence context: "%s"

                    Task: Translate the word "%s" to %s considering its meaning in this specific sentence.

                    Respond in this exact format (no markdown, no explanations):
                    LEMMA: <base form of the word in %s>
                    POS: <part of speech: noun/verb/adjective/adverb/etc>
                    TRANSLATION: <1-3 %s translations separated by commas, most relevant to context first>
                    EXAMPLE: <a short %s example sentence using this word>"""
                    .formatted(sourceLang, text, context, text, targetLang, sourceLang, targetLang, sourceLang);

            case SENTENCE -> """
                    You are translating a full subtitle line from a video.

                    Subtitle: "%s"

                    Translate the whole subtitle to %s, preserving tone and meaning naturally \
                    rather than word-for-word.

                    Respond with ONLY the %s translation, nothing else. No quotes, no explanations."""
                    .formatted(text, targetLang, targetLang);

            case PHRASE -> """
                    You are translating a phrase from a movie subtitle.

                    Full subtitle: "%s"
                    Selected phrase: "%s"

                    Translate the selected phrase to %s, preserving the meaning in context. \
                    If it's an idiom or fixed expression, give the natural %s equivalent \
                    rather than literal translation.

                    Respond with ONLY the %s translation, nothing else. No quotes, no explanations."""
                    .formatted(context, text, targetLang, targetLang, targetLang);
        };
    }
}
