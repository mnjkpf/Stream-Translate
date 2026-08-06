package com.streamtranslate.backend.translate;

// Проксі вимкнений вимикачем app.proxy.enabled або серверний ключ не заданий.
// Окремо від QuotaExceededException: тут чекати завтрашнього скидання марно —
// клієнту треба одразу пропонувати перейти на власний ключ.
public class ProxyUnavailableException extends RuntimeException {

    public ProxyUnavailableException(String message) {
        super(message);
    }
}
