-- Історія перекладів користувача.
--
-- Заповнюється РОЗШИРЕННЯМ (POST /history), а не проксі-сервісом: у режимі
-- «свій ключ» переклад відбувається повністю в браузері й бекенд його не бачить.
-- Якби писав лише проксі, історія була б неповною і залежала б від режиму ключа.
--
-- Дані чутливі (показують, що людина дивиться), тому зберігаються 90 днів —
-- прибирає їх щоденне завдання HistoryRetentionJob.
CREATE TABLE translation_history (
    id          UUID        PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text        VARCHAR(500) NOT NULL,
    translation TEXT        NOT NULL,
    mode        VARCHAR(16) NOT NULL,
    source_lang VARCHAR(32) NOT NULL,
    target_lang VARCHAR(32) NOT NULL,
    source_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Обидва сценарії читання йдуть по user_id і сортуються за часом спадно:
-- сторінка історії та денні агрегати для графіка.
CREATE INDEX idx_history_user_created ON translation_history (user_id, created_at DESC);

-- Окремий індекс під завдання очищення: воно фільтрує ЛИШЕ за created_at
-- по всіх користувачах, тож індекс вище йому не допоміг би.
CREATE INDEX idx_history_created ON translation_history (created_at);
