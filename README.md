# front-dancehall

Frontend-каркас Dancehall на React, TypeScript и Vite. Стартовая страница
проверяет backend запросом `GET /api/ping`.

## Требования

- Node.js 24 LTS
- npm 11

## Локальный запуск

Запустите backend на `http://127.0.0.1:8080`, затем:

```bash
npm ci
npm run dev
```

Vite проксирует `/api/*` в локальный backend и удаляет префикс `/api`, поэтому
frontend всегда использует тот же относительный адрес, что и в production.

## Проверки

```bash
npm run check
```

Команда проверяет lint, форматирование, типы, production build и доступность
собранного HTML и JavaScript через HTTP. Unit-, component- и E2E-тесты в
начальный каркас не входят.

## Production

GitHub Actions упаковывает `dist` в проверяемый статический архив. После push в
`main` архив передаётся на VPS и атомарно становится активной версией frontend.

До первичной настройки VPS деплой отключается repository variable
`PRODUCTION_DEPLOY_ENABLED=false`. После установки серверного deploy script и
добавления environment secrets `DEPLOY_SSH_KEY` и `DEPLOY_KNOWN_HOSTS` переменную
нужно переключить в `true`; последующие push в `main` будут деплоиться автоматически.
Nginx обслуживает frontend по `/`, а запросы `/api/*` проксирует в backend.
