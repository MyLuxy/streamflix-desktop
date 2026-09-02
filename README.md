<h1 align="center">Streamflix Desktop</h1>

<p align="center">
  <img src="./web/public/logo.png" height="100px" />
  <br />
  <strong>🖥️ Desktop Port</strong> - Standalone desktop version of Streamflix Reborn
  <br />
  An open-source desktop app for educational streaming interface, with a Kotlin backend and a Next.js/Electron frontend
  <br />
</p>

<details>
  <summary>Table of Contents</summary>

- [About the project](#about-the-project)
  - [What is Streamflix Desktop?](#-what-is-streamflix-desktop)
  - [Features](#features)
  - [Built with](#built-with)
- [Getting started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Setup](#setup)
- [Development](#development)
- [Contributing](#contributing)
- [Legal Disclaimer](#legal-disclaimer)
- [Credits & Authors](#credits--authors)
- [License](#license)
</details>

## About the project

**Streamflix Desktop** is a standalone desktop port of [Streamflix Reborn](https://github.com/streamflix-reborn2/streamflix), itself a community continuation of the original Streamflix project created by [Lory-Stan TANASI](https://github.com/stantanasi). This port swaps the Android app shell for a Kotlin/JVM backend and a Next.js web UI, packaged as a native desktop app with Electron.

Streamflix Desktop provides a user interface for accessing publicly available streaming content from various third-party providers, aggregated behind a single local backend.

This app is designed for educational purposes and personal use only. Users are responsible for ensuring they have proper authorization to access any content they view through this application.

### 🖥️ What is Streamflix Desktop?

- **Standalone fork**: independent from the original Android-focused repo, packaged for Windows/macOS/Linux
- **Same vision**: maintains the original educational and open-source philosophy
- **Native desktop shell**: no Android Studio, no phone/emulator required
- **Respectful fork**: built with full respect for the original creator's work

### Features

- Open-source and ad-free interface
- Aggregates content from multiple third-party providers
- No account required for the app interface
- Educational and personal use only
- Resume from last playback position
- Runs as a native desktop app (Windows/macOS/Linux)

### Built with

- [Kotlin](https://kotlinlang.org) (backend, `shared/` + `desktop/`)
- [Retrofit](https://square.github.io/retrofit) / [OkHttp](https://square.github.io/okhttp) / [Jsoup](https://jsoup.org)
- [Next.js](https://nextjs.org) / [React](https://react.dev) (frontend, `web/`)
- [Electron](https://www.electronjs.org) (desktop shell, `desktop-client/`)
- Coroutines

## Getting started

### Prerequisites

- [JDK 17](https://adoptium.net) (Temurin recommended)
- [Node.js](https://nodejs.org) (LTS)

### Setup

Clone the project to your local machine:

```bash
git clone https://github.com/MyLuxy/streamflix-desktop.git
```

## Development

Backend (Kotlin HTTP API + HLS proxy), from the repo root:

```bash
./gradlew :desktop:runBackend
```

Frontend (Next.js), from `web/`:

```bash
npm install
npm run dev
```

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a pull request

## Legal Disclaimer

**IMPORTANT: This application is for educational and personal use only.**

- Streamflix does not host, store, or distribute any copyrighted content
- All content is sourced from third-party providers and websites
- Users are solely responsible for ensuring they have legal rights to access any content
- The developers do not endorse or encourage copyright infringement
- Users must comply with all applicable laws in their jurisdiction
- Any legal issues should be directed to the actual content providers
- This app functions as a search engine aggregator only
- No copyrighted material is stored on our servers

## Legal Notice

This application is provided "as is" for educational purposes. The developers:
- Do not claim ownership of any content
- Do not profit from copyrighted material
- Do not control third-party content providers
- Encourage users to support content creators through legal means
- Recommend using official streaming services when available

## Credits & Authors

### Original Creator
- **[Lory-Stan TANASI](https://github.com/stantanasi)** - Original Streamflix project creator

### Streamflix Reborn
- **Independent Developer** - Streamflix Reborn maintainer (Android version)

### Desktop Port
- **[MyLuxy](https://github.com/MyLuxy)** - Desktop port maintainer

## License

This project is licensed under the `Apache-2.0` License - see the [LICENSE](LICENSE) file for details

<p align="center">
  <br />
  © 2022 Lory-Stan TANASI. All rights reserved (original project)
  <br />
  © 2025 Streamflix Reborn. Built with respect for the original work.
</p>
