package com.streamtranslate.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Base64;

import org.junit.jupiter.api.Test;

// Чиста криптографія, без Spring і без БД.
class SettingsCryptoTest {

    // seed розрізняє ключі. Спершу тут був key(31) + "AA==" — і це давало не
    // «інший ключ», а невалідний base64: 31 байт кодується рядком, що вже має
    // власний padding "==", тож дописані символи опинялись ПІСЛЯ нього.
    private static String key(int bytes, int seed) {
        byte[] k = new byte[bytes];
        for (int i = 0; i < bytes; i++) {
            k[i] = (byte) (i + seed);
        }
        return Base64.getEncoder().encodeToString(k);
    }

    private static final SettingsCrypto CRYPTO = new SettingsCrypto(key(32, 0));
    private static final SettingsCrypto DISABLED = new SettingsCrypto("");

    @Test
    void roundTripReturnsTheOriginalValue() {
        String plain = "AIzaSyExample-Key_123";
        String encrypted = CRYPTO.encrypt(plain);

        assertThat(encrypted).startsWith("enc:v1:").doesNotContain(plain);
        assertThat(CRYPTO.decrypt(encrypted)).isEqualTo(plain);
    }

    // Ключова властивість GCM: свіжий IV на кожне шифрування. Якби IV повторювався,
    // однакові значення давали б однаковий шифротекст, і захист руйнувався б.
    @Test
    void sameInputEncryptsDifferentlyEachTime() {
        String plain = "same-key";

        assertThat(CRYPTO.encrypt(plain)).isNotEqualTo(CRYPTO.encrypt(plain));
    }

    // Метод викликається на кожному збереженні налаштувань, тож повторне
    // шифрування вже зашифрованого не має нашаровуватись.
    @Test
    void encryptIsIdempotent() {
        String once = CRYPTO.encrypt("key");

        assertThat(CRYPTO.encrypt(once)).isEqualTo(once);
    }

    // Записи з часів до шифрування не мають префікса — читаються як є, без міграції.
    @Test
    void legacyPlaintextIsReturnedUnchanged() {
        assertThat(CRYPTO.decrypt("AIza-старий-відкритий-ключ")).isEqualTo("AIza-старий-відкритий-ключ");
    }

    @Test
    void emptyAndNullPassThrough() {
        assertThat(CRYPTO.encrypt(null)).isNull();
        assertThat(CRYPTO.encrypt("")).isEmpty();
        assertThat(CRYPTO.decrypt(null)).isNull();
    }

    // Змінений ключ не повинен давати сміття чи виняток на кожному відкритті
    // профілю — лише null, який контролер перетворить на порожнє поле.
    @Test
    void wrongKeyGivesNullInsteadOfGarbage() {
        String encrypted = CRYPTO.encrypt("secret");
        SettingsCrypto other = new SettingsCrypto(key(32, 100)); // валідний, але інший ключ

        assertThat(other.decrypt(encrypted)).isNull();
    }

    @Test
    void disabledCryptoLeavesValuesAlone() {
        assertThat(DISABLED.isEnabled()).isFalse();
        assertThat(DISABLED.encrypt("key")).isEqualTo("key");
        assertThat(DISABLED.decrypt("key")).isEqualTo("key");
    }

    @Test
    void wrongKeyLengthFailsFastAtStartup() {
        assertThatThrownBy(() -> new SettingsCrypto(key(16, 0)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32");
    }

    @Test
    void nonBase64SecretFailsFastAtStartup() {
        assertThatThrownBy(() -> new SettingsCrypto("не-base64!!!"))
                .isInstanceOf(IllegalStateException.class);
    }
}
