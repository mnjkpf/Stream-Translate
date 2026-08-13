CREATE TABLE saved_words(
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text VARCHAR(255) NOT NULL,
    lemma VARCHAR(255) NOT NULL,
    pos VARCHAR(32),
    translation TEXT NOT NULL,
    example TEXT,
    source_lang VARCHAR(16) NOT NULL,
    target_lang VARCHAR(16) NOT NULL,
    context TEXT,
    source_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    
)