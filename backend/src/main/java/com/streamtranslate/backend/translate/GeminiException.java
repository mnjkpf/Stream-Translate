package com.streamtranslate.backend.translate;

import lombok.Getter;

// Помилка з боку Gemini (або мережі до нього). Несе оригінальний статус, щоб
// TranslateController міг відрізнити «квота проєкту вичерпалась» (429) від
// решти і показати користувачеві осмислену причину замість голого 500.
@Getter
public class GeminiException extends RuntimeException {

    private final int upstreamStatus;

    public GeminiException(int upstreamStatus, String message) {
        super(message);
        this.upstreamStatus = upstreamStatus;
    }
}
