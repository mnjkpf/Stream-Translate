-- Налаштування користувача (apiKey, sourceLang, targetLang, model) як гнучке JSONB.
-- DEFAULT '{}' — існуючі рядки одразу дістають порожній об'єкт, NOT NULL безпечний.
ALTER TABLE users ADD COLUMN settings JSONB NOT NULL DEFAULT '{}'::jsonb;
