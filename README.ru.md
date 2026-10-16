<h1 align="center">Streamflix Desktop</h1>

<p align="center">
  <img src="./.github/docs/StreamFlixLogo.png" height="235px" />
  <br />
  <strong>Версия для компьютера</strong> — Streamflix Reborn без телефона и эмулятора
  <br />
  Открытый код: Kotlin на бэкенде, Next.js и Electron спереди
  <br />
  <br />
   <a href="https://github.com/MyLuxy/streamflix-desktop/releases/latest"><img src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/MyLuxy/streamflix-desktop/badges/downloads.json&style=for-the-badge" alt="Downloads" width="216" /></a>
  <a href="https://github.com/sponsors/MyLuxy"><img src="https://img.shields.io/badge/Sponsor-%E2%9D%A4-db61a2?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="Sponsor MyLuxy on GitHub" width="171" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <b>Русский</b>
</p>

<details>
  <summary>Оглавление</summary>

- [Зачем это](#зачем-это)
  - [Коротко](#коротко)
  - [Что умеет](#что-умеет)
  - [Стек](#стек)
- [Как поставить](#как-поставить)
  - [Что нужно](#что-нужно)
  - [Клон](#клон)
- [Разработка](#разработка)
- [Хочешь помочь](#хочешь-помочь)
- [Важно про закон](#важно-про-закон)
- [Кто сделал](#кто-сделал)
- [Лицензия](#лицензия)
</details>

## Зачем это

<p align="center">
  <img src="./.github/docs/StreamFlixDesktop.png" alt="Streamflix Preview">
</p>

**Streamflix Desktop** — это [Streamflix Reborn](https://git.gay/streamflix-reborn2/streamflix) на ПК. Оригинал начинал [Lory-Stan TANASI](https://github.com/stantanasi), потом проект подхватило сообщество; здесь вместо Android — свой бэкенд на Kotlin и интерфейс на Next.js, всё в одном Electron-приложении.

Идея простая: один экран, разные источники — каталог и потоки крутятся у тебя локально, без облака «от нас».

Сделано, чтобы разбираться в устройстве таких приложений и пользоваться самому. Что именно открывать и законно ли это у тебя — уже твоя зона.

### Коротко

- Отдельный репозиторий под Windows, macOS и Linux — не «обёртка над телефоном»
- Тот же дух: открытый код, без лишней магии
- Собирается и запускается на компе, Android Studio не нужна
- Порт с уважением к тем, кто тащил проект до этого

### Что умеет

- Интерфейс без рекламы, код открыт
- Тянет контент с нескольких сторонних источников
- Аккаунт в приложении не обязателен
- Можно скачать и смотреть офлайн
- Продолжает с того места, где остановился
- Нормальное десктоп-приложение, не вкладка в браузере

### Стек

- [Kotlin](https://kotlinlang.org) — бэкенд (`shared/`, `desktop/`)
- [Retrofit](https://square.github.io/retrofit) / [OkHttp](https://square.github.io/okhttp) / [Jsoup](https://jsoup.org)
- [Next.js](https://nextjs.org) / [React](https://react.dev) — фронт (`web/`)
- [Electron](https://www.electronjs.org) — оболочка (`desktop-client/`)
- Coroutines

## Как поставить

### Что нужно

- [JDK 17](https://adoptium.net) — удобнее всего Temurin
- [Node.js](https://nodejs.org) LTS

### Клон

```bash
git clone https://github.com/MyLuxy/streamflix-desktop.git
```

## Разработка

Бэкенд (API + HLS-прокси) из корня:

```bash
./gradlew :desktop:runBackend
```

Фронт из `web/`:

```bash
npm install
npm run dev
```

## Хочешь помочь

Любой нормальный PR приветствуется — баг, перевод, мелочь в UI.

1. Форкни репу
2. Ветка: `git checkout -b feature/что-нибудь-полезное`
3. Коммит: `git commit -m 'feat: …'`
4. Пуш и pull request

## Важно про закон

**Приложение не раздаёт фильмы с наших серверов.**

- Мы ничего не хостим и не храним у себя
- Картинка и звук идут со сторонних сайтов
- Законность просмотра — на тебе и на законах твоей страны
- Разработчики не зовут нарушать авторские права
- Претензии по конкретному ролику — к тому, кто его реально отдаёт, не сюда
- По сути это поисковик/агрегатор, а не видеохостинг

Сервис «как есть»: без гарантий, без претензий на чужой контент. Если есть легальный сервис — лучше он.

## Кто сделал

- **[Lory-Stan TANASI](https://github.com/stantanasi)** — оригинальный Streamflix
- **[streamflix-reborn2](https://github.com/streamflix-reborn2)** — Reborn на Android
- **[MyLuxy](https://github.com/MyLuxy)** — эта десктоп-версия

## Лицензия

Apache-2.0 — см. [LICENSE](LICENSE).

<p align="center">
  <br />
  © 2022 Lory-Stan TANASI (оригинал)
  <br />
  © 2025 Streamflix Reborn
</p>
