package com.streamtranslate.backend.user;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

// Шифрування чутливих значень у settings (JSONB) — зараз це лише apiKey користувача.
//
// Що це захищає: витік дампа чи бекапа бази, доступ лише-на-читання до БД,
// випадково розшарений снапшот. Чого НЕ захищає: компрометацію самого сервера —
// там ключ шифрування лежить у змінних середовища поруч. Це нормальна межа для
// шифрування at-rest, і важливо її розуміти, а не вважати захистом від усього.
//
// AES-256-GCM, а не AES-CBC: GCM дає ще й автентифікацію, тобто підмінений
// шифротекст не розшифрується мовчки у сміття, а впаде з помилкою.
@Component
public class SettingsCrypto {

    private static final Logger log = LoggerFactory.getLogger(SettingsCrypto.class);

    // Префікс із версією. Потрібен із двох причин: відрізнити вже зашифровані
    // значення від старих відкритих (щоб міграція не вимагала простою), і мати
    // куди рости, якщо колись зміниться алгоритм — v2 читатиметься паралельно з v1.
    private static final String PREFIX = "enc:v1:";

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_BYTES = 12;      // рекомендований розмір для GCM
    private static final int TAG_BITS = 128;
    private static final int KEY_BYTES = 32;     // AES-256

    private final SecretKey key; // null = шифрування вимкнене
    private final SecureRandom random = new SecureRandom();

    public SettingsCrypto(@Value("${app.settings.secret:}") String secretBase64) {
        if (!StringUtils.hasText(secretBase64)) {
            // Порожнє значення лишає застосунок робочим (зручно локально), але це
            // не той стан, у якому має жити продакшен, тому попереджаємо голосно.
            log.warn("app.settings.secret не задано — API-ключі користувачів зберігаються "
                    + "у базі ВІДКРИТИМ ТЕКСТОМ. Для продакшену задай змінну APP_SETTINGS_SECRET "
                    + "(base64, рівно 32 байти).");
            this.key = null;
            return;
        }

        byte[] keyBytes;
        try {
            keyBytes = Base64.getDecoder().decode(secretBase64.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("app.settings.secret не є коректним base64", e);
        }
        if (keyBytes.length != KEY_BYTES) {
            throw new IllegalStateException("app.settings.secret має бути рівно " + KEY_BYTES
                    + " байтів для AES-256, отримано " + keyBytes.length);
        }
        this.key = new SecretKeySpec(keyBytes, "AES");
    }

    public boolean isEnabled() {
        return key != null;
    }

    // Шифрує значення. Порожнє й уже зашифроване повертає як є — метод має бути
    // ідемпотентним, бо викликається на кожному збереженні налаштувань.
    public String encrypt(String plain) {
        if (key == null || !StringUtils.hasText(plain) || plain.startsWith(PREFIX)) {
            return plain;
        }
        try {
            // Новий IV на КОЖНЕ шифрування. Повторний IV з тим самим ключем у GCM
            // руйнує захист повністю — це не перестраховка, а вимога алгоритму.
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] cipherText = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));

            // IV не є секретом і зберігається поруч із шифротекстом — інакше
            // розшифрувати було б нічим.
            byte[] combined = new byte[iv.length + cipherText.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(cipherText, 0, combined, iv.length, cipherText.length);

            return PREFIX + Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new IllegalStateException("Не вдалося зашифрувати значення налаштувань", e);
        }
    }

    // Розшифровує. Значення без префікса — це старий відкритий текст із часів до
    // шифрування; повертаємо як є, щоб наявні акаунти не зламались.
    public String decrypt(String stored) {
        if (!StringUtils.hasText(stored) || !stored.startsWith(PREFIX)) {
            return stored;
        }
        if (key == null) {
            // Значення зашифроване, а ключа немає — найімовірніше загублено
            // APP_SETTINGS_SECRET. Віддати сміття або впасти було б гірше, ніж
            // чесно показати порожнє поле: користувач просто введе ключ заново.
            log.error("У базі є зашифровані налаштування, але app.settings.secret не задано");
            return null;
        }
        try {
            byte[] combined = Base64.getDecoder().decode(stored.substring(PREFIX.length()));
            byte[] iv = new byte[IV_BYTES];
            System.arraycopy(combined, 0, iv, 0, IV_BYTES);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] plain = cipher.doFinal(combined, IV_BYTES, combined.length - IV_BYTES);
            return new String(plain, StandardCharsets.UTF_8);
        } catch (Exception e) {
            // Найімовірніша причина — ключ змінили. Знову ж таки: краще порожнє
            // поле, ніж 500 на кожному відкритті профілю.
            log.error("Не вдалося розшифрувати налаштування — можливо, змінився app.settings.secret");
            return null;
        }
    }
}
