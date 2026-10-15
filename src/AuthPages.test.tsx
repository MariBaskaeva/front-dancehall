import { StrictMode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, Link, MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import CatalogApp from "./CatalogApp";
import { EMAIL_NOTICE, INVALID_LINK } from "./auth-forms";
import {
  authError,
  csrf,
  emptyPage,
  guest,
  password,
  user,
} from "./test/auth-fixtures";

type Handler = (options: RequestInit) => Response | Promise<Response>;
function mockApi(overrides: Record<string, Handler> = {}) {
  const fetchMock = vi.fn(async (path: string, options: RequestInit = {}) => {
    if (overrides[path]) return overrides[path](options);
    if (path === "/api/v1/users/me") return guest();
    if (path === "/api/v1/auth/csrf") return csrf();
    if (path.startsWith("/api/v1/steps?")) return Response.json(emptyPage);
    if (path === "/api/v1/authors") return Response.json({ items: [] });
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <output data-testid="location">
        {location.pathname}
        {location.hash}
      </output>
      <Link to="/verify-email#token=verification-link">
        Открыть письмо подтверждения
      </Link>
      <Link to="/profile">Открыть личный экран</Link>
    </>
  );
}

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CatalogApp />
      <LocationProbe />
    </MemoryRouter>,
  );
}
function setField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { selector: "input" }), {
    target: { value },
  });
}
function fillRegister() {
  setField("Имя", "  Ярослав  ");
  setField("Email", "  Dancer@Example.com  ");
  setField("Пароль", password);
  setField("Подтверждение пароля", password);
}
function submit(form: string) {
  fireEvent.submit(screen.getByRole("form", { name: form }));
}
const posts = (fetchMock: ReturnType<typeof mockApi>, path: string) =>
  fetchMock.mock.calls.filter(([url]) => url === `/api/v1/auth/${path}`);

async function settle() {
  await act(async () => {});
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("registration and verification", () => {
  it("completes registration → verification → login → profile → logout", async () => {
    let registered = false;
    let verified = false;
    let authenticated = false;
    const fetchMock = mockApi({
      "/api/v1/users/me": () => (authenticated ? Response.json(user) : guest()),
      "/api/v1/auth/register": (options) => {
        expect(JSON.parse(String(options.body))).toEqual({
          name: user.name,
          email: user.email,
          password,
        });
        registered = true;
        return new Response(null, { status: 202 });
      },
      "/api/v1/auth/verify-email": (options) => {
        expect(registered).toBe(true);
        expect(JSON.parse(String(options.body))).toEqual({
          token: "verification-link",
        });
        verified = true;
        return new Response(null, { status: 204 });
      },
      "/api/v1/auth/login": (options) => {
        expect(verified).toBe(true);
        expect(JSON.parse(String(options.body))).toEqual({
          email: user.email,
          password,
        });
        authenticated = true;
        return Response.json(user);
      },
      "/api/v1/auth/logout": () => {
        authenticated = false;
        return new Response(null, { status: 204 });
      },
    });
    open("/register");
    fillRegister();
    submit("Регистрация");
    expect(await screen.findByText(EMAIL_NOTICE)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Отправить письмо повторно" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("link", { name: "Открыть письмо подтверждения" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        /^\/verify-email$/,
      ),
    );
    expect(posts(fetchMock, "verify-email")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить email" }));
    fireEvent.click(
      await screen.findByRole("link", { name: "Перейти ко входу" }),
    );
    setField("Email", user.email);
    setField("Пароль", password);
    submit("Вход");
    expect(
      await screen.findByRole("heading", { name: "Профиль" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(user.email)).toBeInTheDocument(),
    );
    expect(
      within(screen.getByRole("navigation", { name: "Аккаунт" })).getByText(
        user.name,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Выйти" }));
    expect(
      await screen.findByRole("heading", { name: "Каталог степов" }),
    ).toBeInTheDocument();
    await screen.findByText("Каталог пока пуст");
    expect(
      within(screen.getByRole("navigation", { name: "Аккаунт" })).getByRole(
        "link",
        { name: "Войти" },
      ),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([url]) => url.endsWith("/csrf")),
    ).toHaveLength(3);
  });

  it("keeps fragment token through StrictMode and removes it from browser history without sending it automatically", async () => {
    const fetchMock = mockApi({
      "/api/v1/auth/verify-email": () => new Response(null, { status: 204 }),
    });
    const localStorageWrite = vi.spyOn(Storage.prototype, "setItem");
    window.history.replaceState(
      null,
      "",
      "/verify-email#token=private%2Btoken",
    );
    render(
      <StrictMode>
        <BrowserRouter>
          <CatalogApp />
        </BrowserRouter>
      </StrictMode>,
    );
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(posts(fetchMock, "verify-email")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить email" }));
    await screen.findByText("Email подтверждён. Теперь можно войти.");
    expect(
      JSON.parse(String(posts(fetchMock, "verify-email")[0][1]?.body)),
    ).toEqual({ token: "private+token" });
    expect(localStorageWrite).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/verify-email");
    expect(
      screen.queryByRole("button", { name: "Подтвердить email" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    "/verify-email",
    "/verify-email?token=query-only",
    "/verify-email#token=",
    "/verify-email#token=one&token=two",
  ])("offers a new verification link for malformed URL %s", async (path) => {
    const fetchMock = mockApi();
    open(path);
    expect(screen.getByText(INVALID_LINK)).toBeInTheDocument();
    expect(
      screen.getByLabelText("Email для подтверждения"),
    ).toBeInTheDocument();
    await settle();
    expect(posts(fetchMock, "verify-email")).toHaveLength(0);
  });

  it("offers resend after an invalid or expired verification token and keeps the response neutral", async () => {
    const fetchMock = mockApi({
      "/api/v1/auth/verify-email": () =>
        authError("INVALID_OR_EXPIRED_TOKEN", 400),
      "/api/v1/auth/resend-verification": () =>
        new Response(null, { status: 202 }),
    });
    open("/verify-email#token=expired");
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить email" }));
    await screen.findByText(INVALID_LINK);
    setField("Email для подтверждения", " DANCER@example.com ");
    submit("Повторная отправка подтверждения");
    await screen.findByText(EMAIL_NOTICE);
    expect(
      JSON.parse(String(posts(fetchMock, "resend-verification")[0][1]?.body)),
    ).toEqual({ email: user.email });
    expect(
      screen.getByRole("button", { name: "Отправить письмо повторно" }),
    ).toBeDisabled();
  });

  it("allows verification retry after a network failure", async () => {
    let attempts = 0;
    mockApi({
      "/api/v1/auth/verify-email": () => {
        if (attempts++ === 0) return Promise.reject(new TypeError("offline"));
        return new Response(null, { status: 204 });
      },
    });
    open("/verify-email#token=valid");
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить email" }));
    await screen.findByText(/Нет связи с сервером/);
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить email" }));
    await screen.findByText("Email подтверждён. Теперь можно войти.");
  });

  it("blocks double submission while registration is pending", async () => {
    let finish!: (response: Response) => void;
    const fetchMock = mockApi({
      "/api/v1/auth/register": () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    });
    open("/register");
    fillRegister();
    submit("Регистрация");
    await waitFor(() => expect(posts(fetchMock, "register")).toHaveLength(1));
    expect(
      within(screen.getByRole("form", { name: "Регистрация" })).getByRole(
        "button",
      ),
    ).toBeDisabled();
    expect(screen.getByLabelText("Пароль")).toBeDisabled();
    submit("Регистрация");
    expect(posts(fetchMock, "register")).toHaveLength(1);
    await act(async () => {
      finish(new Response(null, { status: 202 }));
    });
    await screen.findByText(EMAIL_NOTICE);
  });
});

describe("login and session", () => {
  it("shows Russian credentials error and allows retry with a short existing password", async () => {
    let authenticated = false;
    let attempts = 0;
    const fetchMock = mockApi({
      "/api/v1/users/me": () => (authenticated ? Response.json(user) : guest()),
      "/api/v1/auth/login": () => {
        if (attempts++ === 0) return authError("INVALID_CREDENTIALS", 401);
        authenticated = true;
        return Response.json(user);
      },
    });
    open("/login");
    setField("Email", user.email);
    setField("Пароль", " ");
    submit("Вход");
    await screen.findByText("Неверный email или пароль.");
    expect(
      screen.queryByText("Backend message must not be displayed"),
    ).not.toBeInTheDocument();
    expect(
      JSON.parse(String(posts(fetchMock, "login")[0][1]?.body)).password,
    ).toBe(" ");
    submit("Вход");
    await screen.findByRole("heading", { name: "Профиль" });
  });

  it("offers resend for unverified email without retrying login automatically", async () => {
    const fetchMock = mockApi({
      "/api/v1/auth/login": () => authError("EMAIL_NOT_VERIFIED", 403),
      "/api/v1/auth/resend-verification": () =>
        new Response(null, { status: 202 }),
    });
    open("/login");
    setField("Email", user.email);
    setField("Пароль", "old-password");
    submit("Вход");
    await screen.findByText(/Подтвердите email перед входом/);
    expect(screen.getByLabelText("Email для подтверждения")).toHaveValue(
      user.email,
    );
    submit("Повторная отправка подтверждения");
    await screen.findByText(EMAIL_NOTICE);
    expect(posts(fetchMock, "login")).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([url]) => url.endsWith("/csrf")),
    ).toHaveLength(1);
  });

  it("restores profile after remount using /users/me", async () => {
    const fetchMock = mockApi({
      "/api/v1/users/me": () => Response.json(user),
    });
    const first = open("/profile");
    await screen.findByText(user.email);
    first.unmount();
    open("/profile");
    await screen.findByText(user.email);
    expect(
      fetchMock.mock.calls.filter(([url]) => url.endsWith("/users/me")),
    ).toHaveLength(2);
    expect(posts(fetchMock, "login")).toHaveLength(0);
  });

  it("redirects guests to login and keeps the catalog public", async () => {
    mockApi();
    open("/profile");
    await screen.findByRole("heading", { name: "Вход" });
    fireEvent.click(screen.getByRole("link", { name: "Dancehall — каталог" }));
    await screen.findByText("Каталог пока пуст");
  });

  it("moves an expired session to login on profile refresh", async () => {
    let active = true;
    mockApi({
      "/api/v1/users/me": () => (active ? Response.json(user) : guest()),
    });
    open("/profile");
    await screen.findByText(user.email);
    active = false;
    fireEvent.click(screen.getByRole("button", { name: "Обновить профиль" }));
    await screen.findByRole("heading", { name: "Вход" });
    expect(screen.queryByText(user.email)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Dancehall — каталог" }));
    await screen.findByText("Каталог пока пуст");
  });

  it("rechecks an existing session when the profile window receives focus", async () => {
    let active = true;
    mockApi({
      "/api/v1/users/me": () => (active ? Response.json(user) : guest()),
    });
    open("/profile");
    await screen.findByText(user.email);
    active = false;
    fireEvent(window, new Event("focus"));
    await screen.findByRole("heading", { name: "Вход" });
  });

  it("offers retry for a startup network failure without hiding public catalog", async () => {
    let attempts = 0;
    mockApi({
      "/api/v1/users/me": () => {
        if (attempts++ === 0) return Promise.reject(new TypeError("offline"));
        return Response.json(user);
      },
    });
    open("/");
    await screen.findByText("Каталог пока пуст");
    const button = await screen.findByRole("button", {
      name: "Повторить проверку входа",
    });
    fireEvent.click(button);
    await screen.findByText(user.name);
    expect(
      screen.queryByRole("button", { name: "Повторить проверку входа" }),
    ).not.toBeInTheDocument();
  });

  it("keeps profile check failures separate from guest redirects and can recover", async () => {
    let attempts = 0;
    mockApi({
      "/api/v1/users/me": () => {
        if (attempts++ === 0) return Promise.reject(new TypeError("offline"));
        return Response.json(user);
      },
    });
    open("/profile");
    fireEvent.click(
      await screen.findByRole("button", { name: "Повторить проверку входа" }),
    );
    await screen.findByText(user.email);
    expect(screen.getByTestId("location")).toHaveTextContent("/profile");
  });

  it("ignores a stale startup response after successful login", async () => {
    let finish!: (response: Response) => void;
    let attempts = 0;
    mockApi({
      "/api/v1/users/me": () =>
        attempts++ === 0
          ? new Promise<Response>((resolve) => {
              finish = resolve;
            })
          : Response.json(user),
      "/api/v1/auth/login": () => Response.json(user),
    });
    open("/login");
    await settle();
    setField("Email", user.email);
    setField("Пароль", password);
    submit("Вход");
    await screen.findByText(user.email);
    await act(async () => {
      finish(guest());
    });
    expect(
      screen.getByRole("heading", { name: "Профиль" }),
    ).toBeInTheDocument();
    expect(screen.getByText(user.email)).toBeInTheDocument();
  });

  it("preserves session if logout fails and lets the user retry", async () => {
    let attempts = 0;
    mockApi({
      "/api/v1/users/me": () => Response.json(user),
      "/api/v1/auth/logout": () => {
        if (attempts++ === 0) return Promise.reject(new TypeError("offline"));
        return new Response(null, { status: 204 });
      },
    });
    open("/profile");
    await screen.findByText(user.email);
    fireEvent.click(screen.getByRole("button", { name: "Выйти" }));
    await screen.findByText(/Нет связи с сервером/);
    expect(screen.getByText(user.email)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Выйти" }));
    await screen.findByRole("heading", { name: "Каталог степов" });
  });
});

describe("password recovery and cooldowns", () => {
  it("accepts recovery neutrally and enables another email request after 60 seconds", async () => {
    vi.useFakeTimers();
    const fetchMock = mockApi({
      "/api/v1/auth/forgot-password": () => new Response(null, { status: 202 }),
    });
    open("/forgot-password");
    await settle();
    setField("Email", " DANCER@example.com ");
    await act(async () => {
      submit("Восстановление пароля");
    });
    expect(screen.getByText(EMAIL_NOTICE)).toBeInTheDocument();
    const button = screen.getByRole("button", {
      name: "Запросить ссылку повторно",
    });
    expect(button).toBeDisabled();
    await act(async () => {
      vi.advanceTimersByTime(59_000);
    });
    expect(button).toBeDisabled();
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(button).toBeEnabled();
    await act(async () => {
      submit("Восстановление пароля");
    });
    expect(posts(fetchMock, "forgot-password")).toHaveLength(2);
  });

  it.each(["90", "10"])(
    "respects Retry-After %s and the minimum 60-second email delay",
    async (retryAfter) => {
      vi.useFakeTimers();
      const fetchMock = mockApi({
        "/api/v1/auth/forgot-password": () =>
          authError("TOO_MANY_REQUESTS", 429, retryAfter),
      });
      open("/forgot-password");
      await settle();
      setField("Email", user.email);
      await act(async () => {
        submit("Восстановление пароля");
      });
      expect(screen.getByText(/Слишком много запросов/)).toBeInTheDocument();
      const button = screen.getByRole("button", { name: "Запросить ссылку" });
      const seconds = Math.max(60, Number(retryAfter));
      await act(async () => {
        vi.advanceTimersByTime((seconds - 1) * 1000);
      });
      expect(button).toBeDisabled();
      submit("Восстановление пароля");
      expect(posts(fetchMock, "forgot-password")).toHaveLength(1);
      await act(async () => {
        vi.advanceTimersByTime(1_000);
      });
      expect(button).toBeEnabled();
    },
  );

  it("uses Retry-After for login attempts", async () => {
    vi.useFakeTimers();
    mockApi({
      "/api/v1/auth/login": () => authError("TOO_MANY_REQUESTS", 429, "20"),
    });
    open("/login");
    await settle();
    setField("Email", user.email);
    setField("Пароль", "old");
    await act(async () => {
      submit("Вход");
    });
    const button = within(screen.getByRole("form", { name: "Вход" })).getByRole(
      "button",
    );
    expect(button).toBeDisabled();
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(button).toBeEnabled();
  });

  it("allows resending verification one minute after registration and resets the timer after resend", async () => {
    vi.useFakeTimers();
    const fetchMock = mockApi({
      "/api/v1/auth/register": () => new Response(null, { status: 202 }),
      "/api/v1/auth/resend-verification": () =>
        new Response(null, { status: 202 }),
    });
    open("/register");
    await settle();
    fillRegister();
    await act(async () => {
      submit("Регистрация");
    });
    const button = screen.getByRole("button", {
      name: "Отправить письмо повторно",
    });
    expect(button).toBeDisabled();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(button).toBeEnabled();
    await act(async () => {
      submit("Повторная отправка подтверждения");
    });
    expect(button).toBeDisabled();
    expect(posts(fetchMock, "resend-verification")).toHaveLength(1);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(button).toBeEnabled();
  });

  it("sets a new password from a fragment token without sending confirmation or signing in", async () => {
    const fetchMock = mockApi({
      "/api/v1/auth/reset-password": () => new Response(null, { status: 204 }),
    });
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    open("/reset-password#token=reset-link");
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        /^\/reset-password$/,
      ),
    );
    expect(posts(fetchMock, "reset-password")).toHaveLength(0);
    setField("Новый пароль", password);
    setField("Подтверждение пароля", password);
    submit("Новый пароль");
    await screen.findByText("Пароль изменён. Войдите заново с новым паролем.");
    expect(
      JSON.parse(String(posts(fetchMock, "reset-password")[0][1]?.body)),
    ).toEqual({ token: "reset-link", newPassword: password });
    expect(posts(fetchMock, "login")).toHaveLength(0);
    expect(storageWrite).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Перейти ко входу" }),
    ).toHaveAttribute("href", "/login");
  });

  it.each(["invalid", "expired"])(
    "offers a new reset link after a %s token",
    async (token) => {
      mockApi({
        "/api/v1/auth/reset-password": () =>
          authError("INVALID_OR_EXPIRED_TOKEN", 400),
      });
      open(`/reset-password#token=${token}`);
      setField("Новый пароль", password);
      setField("Подтверждение пароля", password);
      submit("Новый пароль");
      await screen.findByText(INVALID_LINK);
      fireEvent.click(
        screen.getByRole("link", { name: "Запросить новую ссылку" }),
      );
      expect(
        screen.getByRole("heading", { name: "Восстановление пароля" }),
      ).toBeInTheDocument();
    },
  );

  it.each(["/reset-password", "/reset-password?token=query-only"])(
    "does not allow password reset without a fragment token (%s)",
    async (path) => {
      const fetchMock = mockApi();
      open(path);
      await settle();
      expect(screen.getByText(INVALID_LINK)).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Новый пароль", { selector: "input" }),
      ).not.toBeInTheDocument();
      expect(posts(fetchMock, "reset-password")).toHaveLength(0);
    },
  );
});

describe("accessible form validation", () => {
  it("focuses the first invalid field and labels errors without making HTTP POSTs", async () => {
    const fetchMock = mockApi();
    open("/register");
    submit("Регистрация");
    expect(screen.getByLabelText("Имя")).toHaveFocus();
    expect(screen.getByLabelText("Имя")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Имя")).toHaveAccessibleDescription(
      "Введите имя длиной от 1 до 100 символов.",
    );
    setField("Имя", "Valid");
    setField("Email", "invalid");
    setField("Пароль", "short");
    setField("Подтверждение пароля", "different");
    submit("Регистрация");
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(screen.getByText("Пароли не совпадают.")).toBeInTheDocument();
    await settle();
    expect(posts(fetchMock, "register")).toHaveLength(0);
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/csrf"))).toBe(
      false,
    );
  });

  it("lets the user submit login with the keyboard", async () => {
    const keyboard = userEvent.setup();
    mockApi({
      "/api/v1/auth/login": () => authError("INVALID_CREDENTIALS", 401),
    });
    open("/login");
    screen.getByLabelText("Email").focus();
    await keyboard.type(screen.getByLabelText("Email"), user.email);
    await keyboard.tab();
    expect(screen.getByLabelText("Пароль")).toHaveFocus();
    await keyboard.keyboard("old-password");
    await keyboard.tab();
    expect(
      within(screen.getByRole("form", { name: "Вход" })).getByRole("button"),
    ).toHaveFocus();
    await keyboard.keyboard("{Enter}");
    await screen.findByText("Неверный email или пароль.");
  });
});
