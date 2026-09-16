# front-dancehall

Frontend каталога Dancehall Steps на React, TypeScript и Vite. Контракт API —
[`openapi.yaml`](openapi.yaml).

## Требования

- Node.js 24 LTS
- npm 11

## Локальный запуск

```bash
npm ci
npm run dev
```

Frontend обращается к `/api/v1/steps`, `/api/v1/steps/{slug}` и
`/api/v1/authors`. Vite проксирует `/api/*` в backend на
`http://127.0.0.1:8080`, удаляя префикс `/api`. Пока backend не реализован,
приложение показывает состояние недоступного каталога или ошибку соединения;
тестовые данные не подставляются.

Каталог доступен по `/`, карточка степа — по `/steps/:slug`. Поиск и фильтры
сохраняются в URL; прямые ссылки и кнопки назад/вперёд работают через History API.

## Проверки

```bash
npm run check
```

Команда запускает lint, проверку форматирования, TypeScript, Vitest, production
build и HTTP smoke-тест статических маршрутов. Отдельно тесты запускаются через
`npm test`.

## Production

GitHub Actions упаковывает `dist` в проверяемый статический архив. После push в
`main` архив передаётся на VPS и атомарно становится активной версией frontend.

До первичной настройки VPS деплой отключается repository variable
`PRODUCTION_DEPLOY_ENABLED=false`. После установки серверного deploy script и
добавления environment secrets `DEPLOY_SSH_KEY` и `DEPLOY_KNOWN_HOSTS` переменную
нужно переключить в `true`; последующие push в `main` будут деплоиться автоматически.

Nginx обслуживает frontend по `/`, а `/api/*` проксирует в backend. Для прямых
ссылок на `/steps/:slug` Nginx должен отдавать `index.html` через SPA fallback
(`try_files $uri $uri/ /index.html`) только для frontend-маршрутов; API нельзя
перехватывать этим fallback.
