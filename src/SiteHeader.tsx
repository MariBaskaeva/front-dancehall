import { Link } from "react-router";
import { useAuth } from "./auth-context";
import { useSubmission, authErrorCopy } from "./auth-forms";
import { RequestFeedback } from "./AuthFields";

export default function SiteHeader() {
  const { session, logout, checkSession } = useAuth();
  const request = useSubmission();
  return (
    <>
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Dancehall — каталог">
          D<span>H</span>
          <span className="brand__dot">.</span>
        </Link>
        <nav className="account-nav" aria-label="Аккаунт">
          {session.status === "authenticated" ? (
            <>
              <span className="account-name">{session.user.name}</span>
              <Link to="/profile">Профиль</Link>
              <button
                className="button button--light"
                type="button"
                disabled={request.pending || request.remaining > 0}
                onClick={() => void request.run(logout, () => {})}
              >
                Выйти
              </button>
            </>
          ) : (
            <>
              {session.status === "loading" && (
                <span className="session-loading" role="status">
                  Проверяем вход…
                </span>
              )}
              <Link to="/login">Войти</Link>
              <Link to="/register">Зарегистрироваться</Link>
            </>
          )}
        </nav>
      </header>
      {session.status === "error" && (
        <div className="session-notice" role="alert">
          <p>Не удалось проверить вход. {authErrorCopy(session.error)}</p>
          <button
            className="button button--light"
            type="button"
            onClick={() => void checkSession()}
          >
            Повторить проверку входа
          </button>
        </div>
      )}
      <RequestFeedback
        error={request.error}
        pending={request.pending}
        remaining={request.remaining}
      />
    </>
  );
}
