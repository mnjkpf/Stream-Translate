-- Інтервальні повторення (SRS).
--
-- Стан повторення живе прямо в saved_words, а не в окремій таблиці: у слова
-- рівно один такий стан (зв'язок 1:1), і окрема таблиця дала б лише зайвий JOIN
-- у кожному запиті словника.
--
-- due_at робимо NOT NULL DEFAULT NOW(), щоб уже збережені слова одразу потрапили
-- в чергу: жодне з них ніколи не повторювалось. Nullable дав би третій стан
-- («слово є, плану немає»), який довелося б обробляти окремою умовою всюди.
--
-- reviewed_at навпаки nullable: тут NULL несе реальний зміст — «жодного разу»,
-- і це відрізняється від будь-якої конкретної дати.
--
-- lapses зберігаємо окремо, а не рахуємо з історії: історія живе 90 днів і
-- видаляється, а кількість забувань має пережити ретенцію.
ALTER TABLE saved_words
    ADD COLUMN srs_level   INT         NOT NULL DEFAULT 0,
    ADD COLUMN due_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN lapses      INT         NOT NULL DEFAULT 0,
    ADD COLUMN reviewed_at TIMESTAMPTZ;

-- Черга повторення фільтрує по user_id разом із due_at і сортує за due_at.
CREATE INDEX idx_saved_words_user_due ON saved_words (user_id, due_at);
