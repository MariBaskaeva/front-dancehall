import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import CatalogApp from "./CatalogApp";

const author = {
  id: "6c9ee243-997a-4997-9236-5a5ef855791f",
  slug: "bogle",
  name: "Богл",
};
const step = {
  id: "1f891828-92f8-4ff4-82f7-4b3f1ab6277e",
  slug: "bogle",
  name: "Богл",
  style: "MALE",
  era: "OLD_SCHOOL",
  author,
};
const page = {
  items: [step],
  page: 0,
  size: 20,
  totalElements: 1,
  totalPages: 1,
};

function open(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CatalogApp />
    </MemoryRouter>,
  );
}

function mockApi(steps = page, authors = { items: [author] }) {
  const fetchMock = vi.fn((input: string) => {
    if (input.includes("/authors"))
      return Promise.resolve(Response.json(authors));
    if (input.includes("/steps/")) return Promise.resolve(Response.json(step));
    return Promise.resolve(Response.json(steps));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("catalog", () => {
  it("shows loading, then renders step cards and author options", async () => {
    let resolveSteps!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        input.includes("/authors")
          ? Promise.resolve(Response.json({ items: [author] }))
          : new Promise<Response>((resolve) => {
              resolveSteps = resolve;
            }),
      ),
    );
    open();
    expect(screen.getByText("Загружаем степы…")).toBeInTheDocument();
    resolveSteps(Response.json(page));
    expect(
      await screen.findByRole("link", { name: /Богл/ }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Авторы")).getByRole("option", {
        name: "Богл",
      }),
    ).toBeInTheDocument();
  });

  it("supports style, era and author filters and resets page", async () => {
    const fetchMock = mockApi();
    open("/?page=3");
    await screen.findByRole("link", { name: /Богл/ });
    fireEvent.click(screen.getByRole("button", { name: "Female" }));
    fireEvent.click(screen.getByRole("button", { name: "Old school" }));
    fireEvent.change(screen.getByLabelText("Авторы"), {
      target: { value: "bogle" },
    });
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(
        urls.some(
          (url) =>
            url.includes("style=FEMALE") &&
            url.includes("era=OLD_SCHOOL") &&
            url.includes("author=bogle") &&
            url.includes("page=0"),
        ),
      ).toBe(true);
    });
  });

  it("debounces search and distinguishes no results from an empty catalog", async () => {
    const fetchMock = mockApi({
      items: [],
      page: 0,
      size: 20,
      totalElements: 0,
      totalPages: 0,
    });
    open();
    expect(await screen.findByText("Каталог пока пуст")).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Поиск по названию степа" }),
      { target: { value: "Богл" } },
    );
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some((call) =>
            String(call[0]).includes("q=%D0%91%D0%BE%D0%B3%D0%BB"),
          ),
        ).toBe(true),
      { timeout: 1500 },
    );
    expect(await screen.findByText("Ничего не найдено")).toBeInTheDocument();
  });

  it("moves between result pages", async () => {
    const fetchMock = mockApi({ ...page, totalElements: 21, totalPages: 2 });
    open();
    await screen.findByText("Страница 1 из 2");
    fireEvent.click(screen.getByRole("button", { name: "Вперёд →" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((call) => String(call[0]).includes("page=1")),
      ).toBe(true),
    );
  });

  it("shows a missing catalog as unavailable and retries", async () => {
    let attempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.includes("/authors"))
          return Promise.resolve(Response.json({ items: [author] }));
        attempts += 1;
        return Promise.resolve(
          attempts === 1
            ? new Response("Not found", { status: 404 })
            : Response.json(page),
        );
      }),
    );
    open();
    expect(
      await screen.findByText("Каталог пока недоступен"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Попробовать снова" }));
    expect(
      await screen.findByRole("link", { name: /Богл/ }),
    ).toBeInTheDocument();
  });

  it("keeps steps usable if authors fail and retries authors independently", async () => {
    let authorsAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.includes("/authors")) {
          authorsAttempts += 1;
          return Promise.resolve(
            authorsAttempts === 1
              ? new Response("No authors", { status: 404 })
              : Response.json({ items: [author] }),
          );
        }
        return Promise.resolve(Response.json(page));
      }),
    );
    open();
    expect(
      await screen.findByRole("link", { name: /Богл/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Авторы пока недоступны."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(
      await screen.findByRole("option", { name: "Богл" }),
    ).toBeInTheDocument();
  });
});

describe("step detail and navigation", () => {
  it("opens a step and returns to the filtered catalog", async () => {
    mockApi();
    open("/?style=MALE");
    fireEvent.click(await screen.findByRole("link", { name: /Богл/ }));
    expect(
      await screen.findByRole("heading", { name: "Богл" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Автор движения")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: /Вернуться в каталог/ }));
    expect(
      await screen.findByRole("heading", { name: "Каталог степов" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Male" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows a missing step and allows retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Not found", { status: 404 })),
    );
    open("/steps/unknown");
    expect(await screen.findByText("Степ не найден")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Попробовать снова" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Вернуться в каталог/ }),
    ).toHaveAttribute("href", "/");
  });

  it("shows a local 404 for an unknown frontend route", () => {
    vi.stubGlobal("fetch", vi.fn());
    open("/not-a-route");
    expect(
      screen.getByRole("heading", { name: "Страница не найдена" }),
    ).toBeInTheDocument();
  });
});
