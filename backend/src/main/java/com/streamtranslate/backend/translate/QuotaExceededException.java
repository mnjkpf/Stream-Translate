package com.streamtranslate.backend.translate;

import lombok.Getter;

// Ліміт вичерпано. code розрізняє, ЧИЙ саме ліміт (USER_QUOTA / GLOBAL_QUOTA):
// у першому випадку користувачеві варто перейти на свій ключ або зачекати
// скидання, у другому — це стеля сервісу, і його особисте очікування не поможе.
// Клієнт має розрізняти ці випадки, тому код їде в тілі відповіді, а не лише в тексті.
@Getter
public class QuotaExceededException extends RuntimeException {

    private final String code;

    public QuotaExceededException(String code, String message) {
        super(message);
        this.code = code;
    }
}
