import { useEffect, useMemo, useState } from "react";
import {
  Link,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router";
import {
  ApiError,
  ERAS,
  STYLES,
  getStep,
  listAuthors,
  listSteps,
  type Author,
  type Step,
  type StepEra,
  type StepFilters,
  type StepPage,
  type StepStyle,
} from "./api";

const styleLabels: Record<StepStyle, string> = {
  FEMALE: "Female",
  MALE: "Male",
};
const eraLabels: Record<StepEra, string> = {
  OLD_SCHOOL: "Old school",
  MIDDLE_SCHOOL: "Middle school",
  NEW_SCHOOL: "New school",
};
type LoadState<T> = { data?: T; error?: ApiError; loading: boolean };

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError("network");
}

function errorCopy(error: ApiError, context: "catalog" | "detail") {
  if (error.status === 404 && context === "catalog")
    return [
      "Каталог пока недоступен",
      "API каталога ещё не найден. Попробуйте позже.",
    ];
  if (error.status === 404 && context === "detail")
    return ["Степ не найден", "Проверьте ссылку или вернитесь в каталог."];
  if (error.kind === "timeout")
    return [
      "Сервер не ответил",
      "Запрос занял больше 10 секунд. Попробуйте ещё раз.",
    ];
  if (error.kind === "network")
    return [
      "Нет связи с сервером",
      "Проверьте подключение и попробуйте ещё раз.",
    ];
  if (error.kind === "invalid")
    return [
      "Неожиданный ответ сервера",
      "Данные не соответствуют API. Попробуйте позже.",
    ];
  if (error.status === 400)
    return [
      "Некорректный запрос",
      error.detail ?? "Проверьте параметры и попробуйте ещё раз.",
    ];
  return [
    "Не удалось загрузить данные",
    error.detail ?? "Сервис временно недоступен. Попробуйте ещё раз.",
  ];
}

function ErrorPanel({
  error,
  context,
  onRetry,
}: {
  error: ApiError;
  context: "catalog" | "detail";
  onRetry: () => void;
}) {
  const [title, detail] = errorCopy(error, context);
  return (
    <div className="feedback feedback--error" role="alert">
      <span className="feedback__icon" aria-hidden="true">
        !
      </span>
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
        <button
          className="button button--light"
          type="button"
          onClick={onRetry}
        >
          Попробовать снова
        </button>
      </div>
    </div>
  );
}

function StepFacts({ step }: { step: Step }) {
  return (
    <div className="step-facts">
      <span className="pill pill--style">{styleLabels[step.style]}</span>
      <span className="pill pill--era">{eraLabels[step.era]}</span>
    </div>
  );
}

function StepCard({ step, from }: { step: Step; from: string }) {
  return (
    <Link className="step-card" to={`/steps/${step.slug}`} state={{ from }}>
      <div className="step-card__top">
        <span className="step-card__eyebrow">Dancehall step</span>
        <span className="step-card__arrow" aria-hidden="true">
          ↗
        </span>
      </div>
      <h3>{step.name}</h3>
      <p>Автор: {step.author.name}</p>
      <StepFacts step={step} />
    </Link>
  );
}

function readFilters(params: URLSearchParams): StepFilters {
  const rawPage = params.get("page") ?? "0";
  const page =
    /^\d+$/.test(rawPage) && Number.isSafeInteger(Number(rawPage))
      ? Number(rawPage)
      : 0;
  return {
    q: (params.get("q") ?? "").slice(0, 200),
    styles: [...new Set(params.getAll("style"))].filter(
      (value): value is StepStyle => STYLES.includes(value as StepStyle),
    ),
    eras: [...new Set(params.getAll("era"))].filter((value): value is StepEra =>
      ERAS.includes(value as StepEra),
    ),
    authors: [...new Set(params.getAll("author"))].filter((value) =>
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
    ),
    page,
  };
}

function writeFilters(filters: StepFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  filters.styles.forEach((value) => params.append("style", value));
  filters.eras.forEach((value) => params.append("era", value));
  filters.authors.forEach((value) => params.append("author", value));
  if (filters.page > 0) params.set("page", String(filters.page));
  return params;
}

function Catalog() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);
  const queryKey = params.toString();
  const [draftQuery, setDraftQuery] = useState(filters.q);
  const [steps, setSteps] = useState<LoadState<StepPage>>({ loading: true });
  const [authors, setAuthors] = useState<LoadState<Author[]>>({
    loading: true,
  });
  const [stepsRetry, setStepsRetry] = useState(0);
  const [authorsRetry, setAuthorsRetry] = useState(0);

  useEffect(() => {
    const canonical = writeFilters(
      readFilters(new URLSearchParams(queryKey)),
    ).toString();
    if (canonical !== queryKey) setParams(canonical, { replace: true });
  }, [queryKey, setParams]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setDraftQuery(filters.q);
    });
    return () => {
      active = false;
    };
  }, [filters.q]);

  useEffect(() => {
    if (draftQuery.trim() === filters.q) return;
    const timer = window.setTimeout(
      () =>
        setParams(
          writeFilters({
            ...filters,
            q: draftQuery.trim().slice(0, 200),
            page: 0,
          }),
        ),
      400,
    );
    return () => window.clearTimeout(timer);
  }, [draftQuery, filters, setParams]);

  useEffect(() => {
    const controller = new AbortController();
    const current = readFilters(new URLSearchParams(queryKey));
    queueMicrotask(() => {
      if (!controller.signal.aborted)
        setSteps((previous) => ({ data: previous.data, loading: true }));
    });
    void listSteps(current, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setSteps({ data, loading: false });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setSteps({ error: asApiError(error), loading: false });
      });
    return () => controller.abort();
  }, [queryKey, stepsRetry]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setAuthors({ loading: true });
    });
    void listAuthors(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted)
          setAuthors({ data: response.items, loading: false });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setAuthors({ error: asApiError(error), loading: false });
      });
    return () => controller.abort();
  }, [authorsRetry]);

  function updateFilters(update: Partial<StepFilters>) {
    setParams(writeFilters({ ...filters, ...update, page: 0 }));
  }
  function toggle<T extends string>(values: T[], value: T): T[] {
    return values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value];
  }
  const activeCount =
    filters.styles.length +
    filters.eras.length +
    filters.authors.length +
    Number(Boolean(filters.q));
  const from = `${location.pathname}${location.search}`;
  const page = steps.data;

  return (
    <main className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Dancehall — каталог">
          D<span>H</span>
          <span className="brand__dot">.</span>
        </Link>
        <span className="header-caption">Энциклопедия движений</span>
      </header>
      <section className="hero" aria-labelledby="page-title">
        <div className="hero__copy">
          <p className="eyebrow">Твой гид по dancehall</p>
          <h1 id="page-title">
            Найди свой <em>движ.</em>
          </h1>
          <p>
            Исследуй степы, авторов и эпохи. Каждое движение — часть большой
            истории.
          </p>
        </div>
        <div className="hero__mark" aria-hidden="true">
          DANCE
          <br />
          HALL<span>★</span>
        </div>
      </section>
      <div className="catalog-layout">
        <aside className="filters" aria-label="Фильтры каталога">
          <div className="filters__heading">
            <h2>Фильтры</h2>
            {activeCount > 0 && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setDraftQuery("");
                  setParams(new URLSearchParams());
                }}
              >
                Сбросить
              </button>
            )}
          </div>
          <fieldset>
            <legend>Стиль</legend>
            <div className="chip-group">
              {STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  className={`chip ${filters.styles.includes(style) ? "chip--active" : ""}`}
                  aria-pressed={filters.styles.includes(style)}
                  onClick={() =>
                    updateFilters({ styles: toggle(filters.styles, style) })
                  }
                >
                  {styleLabels[style]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Эра</legend>
            <div className="chip-group">
              {ERAS.map((era) => (
                <button
                  key={era}
                  type="button"
                  className={`chip ${filters.eras.includes(era) ? "chip--active" : ""}`}
                  aria-pressed={filters.eras.includes(era)}
                  onClick={() =>
                    updateFilters({ eras: toggle(filters.eras, era) })
                  }
                >
                  {eraLabels[era]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="author-filter">
            <label htmlFor="author-filter">Авторы</label>
            {authors.error ? (
              <div className="filter-error" role="alert">
                <span>Авторы пока недоступны.</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setAuthorsRetry((value) => value + 1)}
                >
                  Повторить
                </button>
              </div>
            ) : (
              <>
                <select
                  id="author-filter"
                  multiple
                  size={Math.min(5, Math.max(2, authors.data?.length ?? 2))}
                  disabled={authors.loading || !authors.data?.length}
                  value={filters.authors}
                  onChange={(event) =>
                    updateFilters({
                      authors: Array.from(
                        event.currentTarget.selectedOptions,
                        (option) => option.value,
                      ),
                    })
                  }
                >
                  {authors.data?.map((author) => (
                    <option key={author.id} value={author.slug}>
                      {author.name}
                    </option>
                  ))}
                </select>
                <small>
                  {authors.loading
                    ? "Загружаем авторов…"
                    : "Для выбора нескольких используйте Ctrl/Cmd или Shift."}
                </small>
              </>
            )}
          </div>
        </aside>
        <section className="catalog" aria-labelledby="catalog-title">
          <div className="catalog__toolbar">
            <div>
              <p className="eyebrow">Коллекция движений</p>
              <h2 id="catalog-title">Каталог степов</h2>
            </div>
            {page && !steps.error && (
              <span className="result-count">
                {page.totalElements}{" "}
                {page.totalElements === 1 ? "степ" : "степов"}
              </span>
            )}
          </div>
          <label className="search-box">
            <span className="sr-only">Поиск по названию степа</span>
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={draftQuery}
              maxLength={200}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="Найти степ по названию…"
            />
          </label>
          <div className="results" aria-live="polite" aria-busy={steps.loading}>
            {steps.loading && !page && (
              <div className="feedback">
                <span className="spinner" aria-hidden="true" />
                <p>Загружаем степы…</p>
              </div>
            )}
            {steps.error && (
              <ErrorPanel
                error={steps.error}
                context="catalog"
                onRetry={() => setStepsRetry((value) => value + 1)}
              />
            )}
            {page && !steps.error && (
              <>
                {steps.loading && (
                  <p className="updating">Обновляем результаты…</p>
                )}
                {page.items.length > 0 ? (
                  <div className="step-grid">
                    {page.items.map((step) => (
                      <StepCard key={step.id} step={step} from={from} />
                    ))}
                  </div>
                ) : (
                  <div className="feedback feedback--empty">
                    <span className="feedback__icon" aria-hidden="true">
                      ✳
                    </span>
                    <div>
                      <h3>
                        {activeCount
                          ? "Ничего не найдено"
                          : "Каталог пока пуст"}
                      </h3>
                      <p>
                        {activeCount
                          ? "Попробуйте другой запрос или сбросьте фильтры."
                          : "Степы появятся здесь, когда их добавят."}
                      </p>
                      {activeCount > 0 && (
                        <button
                          className="button button--light"
                          type="button"
                          onClick={() => {
                            setDraftQuery("");
                            setParams(new URLSearchParams());
                          }}
                        >
                          Сбросить фильтры
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {page.totalPages > 1 && (
                  <nav className="pagination" aria-label="Страницы каталога">
                    <button
                      type="button"
                      disabled={filters.page === 0 || steps.loading}
                      onClick={() =>
                        setParams(
                          writeFilters({ ...filters, page: filters.page - 1 }),
                        )
                      }
                    >
                      ← Назад
                    </button>
                    <span>
                      Страница {page.page + 1} из {page.totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={
                        filters.page + 1 >= page.totalPages || steps.loading
                      }
                      onClick={() =>
                        setParams(
                          writeFilters({ ...filters, page: filters.page + 1 }),
                        )
                      }
                    >
                      Вперёд →
                    </button>
                  </nav>
                )}
              </>
            )}
          </div>
        </section>
      </div>
      <footer className="site-footer">
        Dancehall Steps <span>© {new Date().getFullYear()}</span>
      </footer>
    </main>
  );
}

function Detail() {
  const { slug } = useParams();
  const location = useLocation();
  const back =
    typeof location.state?.from === "string" &&
    location.state.from.startsWith("/")
      ? location.state.from
      : "/";
  const [state, setState] = useState<LoadState<Step>>({ loading: true });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setState({ loading: true });
    });
    void getStep(slug, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, loading: false });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ error: asApiError(error), loading: false });
      });
    return () => controller.abort();
  }, [slug, retry]);
  return (
    <main className="app-shell detail-shell">
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Dancehall — каталог">
          D<span>H</span>
          <span className="brand__dot">.</span>
        </Link>
        <span className="header-caption">Энциклопедия движений</span>
      </header>
      <Link className="back-link" to={back}>
        ← Вернуться в каталог
      </Link>
      {state.loading && (
        <div className="feedback">
          <span className="spinner" aria-hidden="true" />
          <p>Загружаем степ…</p>
        </div>
      )}
      {state.error && (
        <ErrorPanel
          error={state.error}
          context="detail"
          onRetry={() => setRetry((value) => value + 1)}
        />
      )}
      {state.data && (
        <article className="detail-card">
          <p className="eyebrow">Dancehall step / {state.data.slug}</p>
          <h1>{state.data.name}</h1>
          <StepFacts step={state.data} />
          <div className="detail-card__divider" />
          <div className="detail-card__author">
            <span>Автор движения</span>
            <strong>{state.data.author.name}</strong>
          </div>
        </article>
      )}
      <footer className="site-footer">
        Dancehall Steps <span>© {new Date().getFullYear()}</span>
      </footer>
    </main>
  );
}

function NotFound() {
  return (
    <main className="app-shell detail-shell">
      <div className="feedback feedback--error">
        <span className="feedback__icon" aria-hidden="true">
          404
        </span>
        <div>
          <h1>Страница не найдена</h1>
          <p>Такого адреса в приложении нет.</p>
          <Link className="button button--light" to="/">
            В каталог
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function CatalogApp() {
  return (
    <Routes>
      <Route path="/" element={<Catalog />} />
      <Route path="/steps/:slug" element={<Detail />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
