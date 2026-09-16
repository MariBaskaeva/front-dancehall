import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import CatalogApp from "./CatalogApp";

const author = {
  id: "6c9ee243-997a-4997-9236-5a5ef855791f",
  slug: "bogle",
  name: "Богл",
};
const oldStep = {
  id: "1f891828-92f8-4ff4-82f7-4b3f1ab6277e",
  slug: "old-step",
  name: "Старый степ",
  style: "MALE",
  era: "OLD_SCHOOL",
  author,
};
const newStep = {
  ...oldStep,
  id: "09f6c26b-d410-414f-a6c2-18c09a12ccab",
  slug: "new-step",
  name: "Новый степ",
  style: "FEMALE",
};

afterEach(() => vi.unstubAllGlobals());

it("ignores an old response after the filters change", async () => {
  let resolveOld!: (response: Response) => void;
  const fetchMock = vi.fn((input: string) => {
    if (input.includes("/authors"))
      return Promise.resolve(Response.json({ items: [author] }));
    if (input.includes("style=FEMALE"))
      return Promise.resolve(
        Response.json({
          items: [newStep],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
        }),
      );
    return new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MemoryRouter>
      <CatalogApp />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes("/steps?")),
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: "Female" }));
  expect(
    await screen.findByRole("link", { name: /Новый степ/ }),
  ).toBeInTheDocument();
  resolveOld(
    Response.json({
      items: [oldStep],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("link", { name: /Старый степ/ }),
    ).not.toBeInTheDocument(),
  );
});

it("normalizes invalid URL filters before requesting the catalog", async () => {
  const fetchMock = vi.fn((input: string) =>
    input.includes("/authors")
      ? Promise.resolve(Response.json({ items: [author] }))
      : Promise.resolve(
          Response.json({
            items: [],
            page: 0,
            size: 20,
            totalElements: 0,
            totalPages: 0,
          }),
        ),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MemoryRouter initialEntries={["/?style=UNKNOWN&page=-1&unexpected=yes"]}>
      <CatalogApp />
    </MemoryRouter>,
  );
  await screen.findByText("Каталог пока пуст");
  const stepUrls = fetchMock.mock.calls
    .map((call) => String(call[0]))
    .filter((url) => url.includes("/steps?"));
  expect(
    stepUrls.every((url) => !url.includes("UNKNOWN") && url.includes("page=0")),
  ).toBe(true);
});
