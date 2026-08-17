package com.streamtranslate.backend.user;

import java.util.HashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.streamtranslate.backend.auth.CurrentUser;
import com.streamtranslate.backend.user.dto.MeResponse;
import com.streamtranslate.backend.user.dto.SettingsUpdateRequest;

// Профіль + налаштування поточного користувача. user_id завжди з JWT (CurrentUser.id).
//
// settings містять apiKey — ключ Gemini користувача. У базу він іде ЗАШИФРОВАНИМ
// (SettingsCrypto), а назовні віддається розшифрованим: розширення підставляє його
// у виклики Gemini напряму з браузера, тож іншого корисного вигляду для клієнта немає.
// Шифрування захищає дамп бази, а не канал — канал закриває HTTPS.
@RestController
@RequestMapping("/me")
public class MeController {

    // Єдине поле налаштувань, яке шифрується. Мови й модель не є секретом, а зайве
    // шифрування ускладнило б і читання логів, і майбутні міграції даних.
    private static final String SECRET_SETTING = "apiKey";

    private final UserRepository userRepository;
    private final SettingsCrypto settingsCrypto;

    public MeController(UserRepository userRepository, SettingsCrypto settingsCrypto) {
        this.userRepository = userRepository;
        this.settingsCrypto = settingsCrypto;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public MeResponse me(@AuthenticationPrincipal Jwt jwt) {
        return MeResponse.from(currentUser(jwt), this::decryptSettings);
    }

    @PutMapping("/settings")
    @Transactional
    public MeResponse updateSettings(@AuthenticationPrincipal Jwt jwt,
            @RequestBody SettingsUpdateRequest request) {
        Users user = currentUser(jwt);

        // Копіюємо в НОВУ мапу і мержимо лише не-null поля (щоб оновлення одного не
        // затирало решти). Реассайн, а не мутація на місці — так Hibernate гарантовано
        // помічає зміну JSONB-поля незалежно від mutability-плану JSON-типу.
        Map<String, String> settings = new HashMap<>(user.getSettings());
        // Шифруємо одразу при записі: далі це значення живе в мапі, яка піде в JSONB.
        putIfPresent(settings, SECRET_SETTING, settingsCrypto.encrypt(request.apiKey()));
        putIfPresent(settings, "sourceLang", request.sourceLang());
        putIfPresent(settings, "targetLang", request.targetLang());
        putIfPresent(settings, "model", request.model());
        // 'own' | 'proxy' — без цього рядка вибір «вбудований ключ» не переживав
        // би перехід на інший пристрій: розширення читає keySource назад при логіні.
        putIfPresent(settings, "keySource", request.keySource());
        // Мова інтерфейсу ('uk' | 'en' | 'pl'). Валідація тут свідомо відсутня:
        // невідоме значення розширення просто проігнорує і візьме мову браузера,
        // тож 400-та на нього була б суворіша за наслідки.
        putIfPresent(settings, "uiLang", request.uiLang());
        user.setSettings(settings);

        return MeResponse.from(userRepository.save(user), this::decryptSettings);
    }

    // Розшифровує лише секретне поле, решту лишає як є. Значення без префікса
    // enc:v1: — це записи з часів до шифрування, вони читаються далі без міграції.
    private Map<String, String> decryptSettings(Map<String, String> stored) {
        if (stored == null || stored.isEmpty()) {
            return stored;
        }
        Map<String, String> result = new HashMap<>(stored);
        String secret = result.get(SECRET_SETTING);
        if (secret != null) {
            String plain = settingsCrypto.decrypt(secret);
            // null означає, що розшифрувати не вдалося (загублений/змінений ключ).
            // Прибираємо поле замість того, щоб віддавати сміття: розширення покаже
            // порожнє поле ключа, і користувач введе його заново.
            if (plain == null) {
                result.remove(SECRET_SETTING);
            } else {
                result.put(SECRET_SETTING, plain);
            }
        }
        return result;
    }

    private static void putIfPresent(Map<String, String> settings, String key, String value) {
        if (value != null) {
            settings.put(key, value);
        }
    }

    private Users currentUser(Jwt jwt) {
        return userRepository.findById(CurrentUser.id(jwt))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Користувача не знайдено"));
    }
}
