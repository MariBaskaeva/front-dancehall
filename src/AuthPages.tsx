import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { ApiError } from "./api";
import { useAuth } from "./auth-context";
import {
  EMAIL_NOTICE,
  INVALID_LINK,
  confirmationError,
  emailError,
  nameError,
  normalizeEmail,
  passwordError,
  useSubmission,
  useFormErrors,
} from "./auth-forms";
import { Field, RequestFeedback, Success } from "./AuthFields";
import SiteHeader from "./SiteHeader";

function AuthLayout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="app-shell">
      <SiteHeader />
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">Dancehall / Аккаунт</p>
        <h1 id="auth-title">{title}</h1>
        {children}
      </section>
      <Link className="back-link auth-back-link" to="/">
        ← Вернуться в каталог
      </Link>
    </main>
  );
}

function ResendVerification({
  initialEmail = "",
  wait = 0,
}: {
  initialEmail?: string;
  wait?: number;
}) {
  const { api } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const request = useSubmission();
  const { errors, validate } = useFormErrors();
  const remaining = Math.max(wait, request.remaining);
  return (
    <div className="resend-panel">
      <h2>Запросить письмо подтверждения</h2>
      {sent && <Success>{EMAIL_NOTICE}</Success>}
      <form
        noValidate
        aria-label="Повторная отправка подтверждения"
        aria-busy={request.pending}
        onSubmit={(event) => {
          event.preventDefault();
          if (
            remaining > 0 ||
            !validate(event.currentTarget, { email: emailError(email) })
          )
            return;
          void request.run(
            () => api.resendVerification(normalizeEmail(email)),
            () => setSent(true),
            true,
          );
        }}
      >
        <fieldset disabled={request.pending}>
          <Field
            label="Email для подтверждения"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            error={errors.email}
          />
          <button
            className="button button--light"
            type="submit"
            disabled={remaining > 0}
          >
            Отправить письмо повторно
          </button>
        </fieldset>
      </form>
      <RequestFeedback
        error={request.error}
        pending={request.pending}
        remaining={remaining}
      />
    </div>
  );
}

export function RegisterPage() {
  const { api } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [registered, setRegistered] = useState(false);
  const request = useSubmission();
  const { errors, validate } = useFormErrors();
  return (
    <AuthLayout title="Регистрация">
      {registered ? (
        <>
          <Success>{EMAIL_NOTICE}</Success>
          <ResendVerification
            initialEmail={normalizeEmail(email)}
            wait={request.remaining}
          />
        </>
      ) : (
        <>
          <form
            noValidate
            aria-label="Регистрация"
            aria-busy={request.pending}
            onSubmit={(event) => {
              event.preventDefault();
              if (
                !validate(event.currentTarget, {
                  name: nameError(name),
                  email: emailError(email),
                  password: passwordError(password),
                  confirmation: confirmationError(password, confirmation),
                })
              )
                return;
              void request.run(
                () =>
                  api.register({
                    name: name.trim(),
                    email: normalizeEmail(email),
                    password,
                  }),
                () => {
                  setRegistered(true);
                  setPassword("");
                  setConfirmation("");
                },
                true,
              );
            }}
          >
            <fieldset disabled={request.pending}>
              <Field
                label="Имя"
                name="name"
                autoComplete="name"
                value={name}
                onChange={setName}
                error={errors.name}
              />
              <Field
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={setEmail}
                error={errors.email}
              />
              <Field
                label="Пароль"
                name="password"
                type="password"
                autoComplete="new-password"
                hint="От 15 до 128 символов. Пробелы сохраняются."
                value={password}
                onChange={setPassword}
                error={errors.password}
              />
              <Field
                label="Подтверждение пароля"
                name="confirmation"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={setConfirmation}
                error={errors.confirmation}
              />
              <button
                className="button button--primary"
                type="submit"
                disabled={request.remaining > 0}
              >
                Зарегистрироваться
              </button>
            </fieldset>
          </form>
          <RequestFeedback
            error={request.error}
            pending={request.pending}
            remaining={request.remaining}
          />
        </>
      )}
      <p className="auth-links">
        Уже есть аккаунт? <Link to="/login">Войти</Link>
      </p>
    </AuthLayout>
  );
}

function useActionToken() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState(() => {
    const tokens = new URLSearchParams(location.hash.slice(1)).getAll("token");
    return tokens.length === 1 &&
      tokens[0].length > 0 &&
      tokens[0].length <= 512
      ? tokens[0]
      : undefined;
  });
  useEffect(() => {
    if (location.hash)
      void navigate(
        { pathname: location.pathname, search: location.search, hash: "" },
        { replace: true },
      );
  }, [location.hash, location.pathname, location.search, navigate]);
  return { token, clearToken: () => setToken(undefined) };
}

export function VerifyEmailPage() {
  const { api } = useAuth();
  const { token, clearToken } = useActionToken();
  const [verified, setVerified] = useState(false);
  const request = useSubmission();
  const invalid =
    !token ||
    (request.error instanceof ApiError &&
      request.error.code === "INVALID_OR_EXPIRED_TOKEN");
  return (
    <AuthLayout title="Подтверждение email">
      {verified ? (
        <>
          <Success>Email подтверждён. Теперь можно войти.</Success>
          <Link className="button button--primary" to="/login">
            Перейти ко входу
          </Link>
        </>
      ) : invalid ? (
        <>
          <p className="auth-message auth-message--error" role="alert">
            {INVALID_LINK}
          </p>
          <ResendVerification />
        </>
      ) : (
        <>
          <p>Нажмите кнопку, чтобы подтвердить email.</p>
          <button
            className="button button--primary"
            type="button"
            disabled={request.pending || request.remaining > 0}
            onClick={() =>
              void request.run(
                () => api.verifyEmail(token),
                () => {
                  setVerified(true);
                  clearToken();
                },
              )
            }
          >
            Подтвердить email
          </button>
          <RequestFeedback
            error={request.error}
            pending={request.pending}
            remaining={request.remaining}
          />
        </>
      )}
    </AuthLayout>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const request = useSubmission();
  const { errors, validate } = useFormErrors();
  const unverified =
    request.error instanceof ApiError &&
    request.error.code === "EMAIL_NOT_VERIFIED";
  return (
    <AuthLayout title="Вход">
      {location.state?.sessionExpired && (
        <p role="status">Сессия завершилась. Войдите снова.</p>
      )}
      <form
        noValidate
        aria-label="Вход"
        aria-busy={request.pending}
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !validate(event.currentTarget, {
              email: emailError(email),
              password: passwordError(password, false),
            })
          )
            return;
          void request.run(
            () => login(normalizeEmail(email), password),
            () => {
              setPassword("");
              void navigate("/profile", { replace: true });
            },
          );
        }}
      >
        <fieldset disabled={request.pending}>
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            error={errors.email}
          />
          <Field
            label="Пароль"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            error={errors.password}
          />
          <button
            className="button button--primary"
            type="submit"
            disabled={request.remaining > 0}
          >
            Войти
          </button>
        </fieldset>
      </form>
      <RequestFeedback
        error={request.error}
        pending={request.pending}
        remaining={request.remaining}
      />
      {unverified && (
        <ResendVerification initialEmail={normalizeEmail(email)} />
      )}
      <div className="auth-links">
        <Link to="/forgot-password">Забыли пароль?</Link>
        <Link to="/register">Зарегистрироваться</Link>
      </div>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const { api } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const request = useSubmission();
  const { errors, validate } = useFormErrors();
  return (
    <AuthLayout title="Восстановление пароля">
      <p>Укажите email, чтобы запросить ссылку для смены пароля.</p>
      {sent && <Success>{EMAIL_NOTICE}</Success>}
      <form
        noValidate
        aria-label="Восстановление пароля"
        aria-busy={request.pending}
        onSubmit={(event) => {
          event.preventDefault();
          if (!validate(event.currentTarget, { email: emailError(email) }))
            return;
          void request.run(
            () => api.forgotPassword(normalizeEmail(email)),
            () => setSent(true),
            true,
          );
        }}
      >
        <fieldset disabled={request.pending}>
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            error={errors.email}
          />
          <button
            className="button button--primary"
            type="submit"
            disabled={request.remaining > 0}
          >
            {sent ? "Запросить ссылку повторно" : "Запросить ссылку"}
          </button>
        </fieldset>
      </form>
      <RequestFeedback
        error={request.error}
        pending={request.pending}
        remaining={request.remaining}
      />
      <p className="auth-links">
        <Link to="/login">Вернуться ко входу</Link>
      </p>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { api, clearSession } = useAuth();
  const { token, clearToken } = useActionToken();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [reset, setReset] = useState(false);
  const request = useSubmission();
  const { errors, validate } = useFormErrors();
  const invalid =
    !token ||
    (request.error instanceof ApiError &&
      request.error.code === "INVALID_OR_EXPIRED_TOKEN");
  return (
    <AuthLayout title="Новый пароль">
      {reset ? (
        <>
          <Success>Пароль изменён. Войдите заново с новым паролем.</Success>
          <Link className="button button--primary" to="/login">
            Перейти ко входу
          </Link>
        </>
      ) : invalid ? (
        <>
          <p className="auth-message auth-message--error" role="alert">
            {INVALID_LINK}
          </p>
          <Link className="button button--light" to="/forgot-password">
            Запросить новую ссылку
          </Link>
        </>
      ) : (
        <>
          <form
            noValidate
            aria-label="Новый пароль"
            aria-busy={request.pending}
            onSubmit={(event) => {
              event.preventDefault();
              if (
                !validate(event.currentTarget, {
                  password: passwordError(password),
                  confirmation: confirmationError(password, confirmation),
                })
              )
                return;
              void request.run(
                () => api.resetPassword(token, password),
                () => {
                  clearSession();
                  setReset(true);
                  clearToken();
                  setPassword("");
                  setConfirmation("");
                },
              );
            }}
          >
            <fieldset disabled={request.pending}>
              <Field
                label="Новый пароль"
                name="password"
                type="password"
                autoComplete="new-password"
                hint="От 15 до 128 символов. Пробелы сохраняются."
                value={password}
                onChange={setPassword}
                error={errors.password}
              />
              <Field
                label="Подтверждение пароля"
                name="confirmation"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={setConfirmation}
                error={errors.confirmation}
              />
              <button
                className="button button--primary"
                type="submit"
                disabled={request.remaining > 0}
              >
                Сохранить пароль
              </button>
            </fieldset>
          </form>
          <RequestFeedback
            error={request.error}
            pending={request.pending}
            remaining={request.remaining}
          />
        </>
      )}
    </AuthLayout>
  );
}

export function ProfilePage() {
  const { session, checkSession } = useAuth();
  // Startup already checks /users/me. Later visits perform a fresh check.
  const [needsCheck] = useState(
    session.status === "authenticated" || session.status === "error",
  );
  const [wasAuthenticated] = useState(session.status === "authenticated");
  useEffect(() => {
    const controller = new AbortController();
    if (needsCheck)
      queueMicrotask(() => {
        if (!controller.signal.aborted) void checkSession();
      });
    const refresh = () => {
      void checkSession();
    };
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [checkSession, needsCheck]);

  if (session.status === "guest")
    return (
      <Navigate
        to="/login"
        replace
        state={{ sessionExpired: wasAuthenticated }}
      />
    );
  return (
    <AuthLayout title="Профиль">
      {session.status === "loading" && <p role="status">Загружаем профиль…</p>}
      {session.status === "error" && (
        <p>Повторите проверку входа, чтобы открыть профиль.</p>
      )}
      {session.status === "authenticated" && (
        <>
          <dl className="profile-facts">
            <dt>Имя</dt>
            <dd>{session.user.name}</dd>
            <dt>Email</dt>
            <dd>{session.user.email}</dd>
          </dl>
          <button
            className="button button--light"
            type="button"
            onClick={() => void checkSession()}
          >
            Обновить профиль
          </button>
        </>
      )}
    </AuthLayout>
  );
}
