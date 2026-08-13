ALTER TABLE saved_words
    ADD CONSTRAINT uq_saved_words_user_lemma_langs UNIQUE (user_id, lemma, source_lang, target_lang);

CREATE INDEX idx_saved_words_user_updated_at ON saved_words (user_id, updated_at DESC);
