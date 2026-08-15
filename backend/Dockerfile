# Образ бекенду. Двоетапний: збірка й рантайм розділені, щоб у фінальний образ
# не потрапили Maven, JDK і ~200 МБ завантажених залежностей.
#
# Чому власний Dockerfile, а не `mvnw spring-boot:build-image` (buildpacks):
# образ, зібраний тут, однаково працює на Railway, Render, Fly.io і на звичайному
# VPS. Buildpacks зручні, але прив'язують до того, як конкретний хостинг їх
# запускає, і на VPS довелося б усе одно писати це вручну.
#
# Контекст збірки — тека backend/, а не корінь репозиторію:
#   docker build -t stream-translate-backend ./backend

# ── Етап 1: збірка ──────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Спершу лише pom.xml і завантаження залежностей окремим шаром. Docker кешує
# шари по контрольній сумі вхідних файлів: поки pom не змінився, цей шар
# береться з кешу, і правка коду не тягне за собою повторне викачування
# половини Maven Central. Якби копіювали все одразу, кожна зміна рядка коду
# коштувала б кількох хвилин збірки.
COPY pom.xml .
RUN mvn -B dependency:go-offline

COPY src ./src
# -DskipTests: тести вимагають Testcontainers, тобто докера всередині докера.
# Вони проганяються локально й у CI до збірки образу, а не під час неї.
RUN mvn -B clean package -DskipTests

# ── Етап 2: рантайм ─────────────────────────────────────────────────────────
# JRE, не JDK: компілятор у продакшені не потрібен, а образ менший і має меншу
# поверхню атаки.
FROM eclipse-temurin:21-jre AS runtime
WORKDIR /app

# Непривілейований користувач. За замовчуванням контейнер працює від root, і
# будь-яка вразливість у застосунку одразу дає root усередині контейнера.
RUN useradd --system --uid 1001 --create-home appuser
USER appuser

COPY --from=build --chown=appuser:appuser /build/target/*.jar app.jar

EXPOSE 8080

# MaxRAMPercentage замість -Xmx: JVM бачить ліміт пам'яті контейнера й рахує
# купу від нього. Фіксований -Xmx довелося б міняти щоразу при зміні тарифу, а
# без будь-якого ліміту JVM на маленькому інстансі забирає забагато й падає з OOMKilled.
# 75% лишає місце для метапростору, стеків потоків і самої ОС.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+UseContainerSupport"

# sh -c, щоб розкрилися змінні середовища в JAVA_OPTS.
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
