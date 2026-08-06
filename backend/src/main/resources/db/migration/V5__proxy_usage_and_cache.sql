-- Лічильник використання вбудованого ключа (проксі-перекладів).
-- usage_date — дата у часовому поясі America/Los_Angeles: добова квота Gemini
-- скидається опівночі за тихоокеанським часом, тож рахувати по UTC не можна —
-- вікна розійшлися б, і ми б перевищили ліміт наприкінці доби.
CREATE TABLE proxy_usage (
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    usage_date    DATE NOT NULL,
    request_count INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, usage_date)
);

-- Швидкий підрахунок глобальної денної суми (ліміти Gemini діють НА ПРОЄКТ,
-- тож самих лише персональних лімітів мало — один активний юзер з'їв би квоту всіх).
CREATE INDEX idx_proxy_usage_date ON proxy_usage (usage_date);

-- Спільний кеш перекладів. Однакові слова повторюються між користувачами
-- постійно, тому це головний важіль, щоб лишатися в безкоштовному тарифі.
-- Персональних даних не містить: лише текст оригіналу (хешований у ключі) і переклад.
CREATE TABLE translation_cache (
    cache_key   VARCHAR(64) PRIMARY KEY,  -- SHA-256 hex від mode|src|tgt|text|context
    translation TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
