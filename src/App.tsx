import { useCallback, useEffect, useRef, useState } from "react";

const pingUrl = "/api/ping";
const timeoutMilliseconds = 5_000;

type PingState =
  | { status: "loading" }
  | { status: "success"; response: string }
  | { status: "timeout" }
  | { status: "error" };

async function fetchPing(signal: AbortSignal): Promise<string> {
  const response = await fetch(pingUrl, {
    headers: { Accept: "text/plain" },
    signal,
  });
  const responseText = (await response.text()).trim();
  const contentType = response.headers.get("content-type") ?? "";

  if (
    response.status !== 200 ||
    !contentType.toLowerCase().startsWith("text/plain") ||
    responseText !== "pong"
  ) {
    throw new Error("Unexpected ping response");
  }

  return responseText;
}

function App() {
  const [pingState, setPingState] = useState<PingState>({ status: "loading" });
  const activeController = useRef<AbortController | null>(null);

  const checkBackend = useCallback(async () => {
    activeController.current?.abort();

    const controller = new AbortController();
    activeController.current = controller;
    setPingState({ status: "loading" });

    const timeout = window.setTimeout(() => {
      controller.abort("timeout");
    }, timeoutMilliseconds);

    try {
      const response = await fetchPing(controller.signal);

      if (activeController.current === controller) {
        setPingState({ status: "success", response });
      }
    } catch {
      if (activeController.current !== controller) {
        return;
      }

      if (controller.signal.aborted && controller.signal.reason === "timeout") {
        setPingState({ status: "timeout" });
      } else if (!controller.signal.aborted) {
        setPingState({ status: "error" });
      }
    } finally {
      window.clearTimeout(timeout);

      if (activeController.current === controller) {
        activeController.current = null;
      }
    }
  }, []);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      void checkBackend();
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      activeController.current?.abort();
    };
  }, [checkBackend]);

  const isLoading = pingState.status === "loading";

  return (
    <main className="page-shell">
      <section className="connection-card" aria-labelledby="page-title">
        <p className="eyebrow">Dancehall</p>
        <h1 id="page-title">Связь с сервером</h1>
        <p className="intro">Проверяем доступность backend через единый API.</p>

        <div
          className={`status status--${pingState.status}`}
          aria-live="polite"
        >
          <span className="status__indicator" aria-hidden="true" />
          <div>
            {pingState.status === "loading" && (
              <>
                <strong>Проверяем соединение с сервером…</strong>
                <span>Это займёт не больше пяти секунд.</span>
              </>
            )}
            {pingState.status === "success" && (
              <>
                <strong>Сервер доступен</strong>
                <span>
                  Ответ: <code>{pingState.response}</code>
                </span>
              </>
            )}
            {pingState.status === "timeout" && (
              <>
                <strong>Сервер не ответил за 5 секунд</strong>
                <span>Попробуйте выполнить проверку ещё раз.</span>
              </>
            )}
            {pingState.status === "error" && (
              <>
                <strong>Не удалось связаться с сервером</strong>
                <span>
                  Получен некорректный ответ или произошла сетевая ошибка.
                </span>
              </>
            )}
          </div>
        </div>

        <div className="card-footer">
          <code className="endpoint">GET {pingUrl}</code>
          <button
            type="button"
            onClick={() => void checkBackend()}
            disabled={isLoading}
          >
            {isLoading ? "Проверяем…" : "Проверить снова"}
          </button>
        </div>
      </section>
    </main>
  );
}

export default App;
