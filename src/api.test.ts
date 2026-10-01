import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  ERAS,
  isStep,
  isStepPage,
  getStep,
  listAuthors,
  listSteps,
  stepQuery,
  type StepFilters,
} from "./api";

const filters: StepFilters = {
  q: "  Богл  ",
  styles: ["FEMALE", "MALE"],
  eras: ["OLD"],
  authors: ["bogle", "other"],
  page: 2,
};

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
  era: "OLD",
  author,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Dancehall API client", () => {
  it("serializes repeated filters and fixed page size", () => {
    const params = new URLSearchParams(stepQuery(filters));
    expect(params.get("q")).toBe("Богл");
    expect(params.getAll("style")).toEqual(["FEMALE", "MALE"]);
    expect(params.getAll("era")).toEqual(["OLD"]);
    expect(params.getAll("author")).toEqual(["bogle", "other"]);
    expect(params.get("page")).toBe("2");
    expect(params.get("size")).toBe("20");
  });

  it("loads a valid page and sends JSON accept headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        content: [step],
        page: { number: 2, size: 20, totalElements: 41, totalPages: 3 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const page = await listSteps(filters);
    expect(page.content[0]?.name).toBe("Богл");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/v1/steps?");
    expect(fetchMock.mock.calls[0]?.[1]?.headers.Accept).toContain(
      "application/json",
    );
  });

  it("loads an author collection and a detail", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [author] }))
      .mockResolvedValueOnce(Response.json(step));
    vi.stubGlobal("fetch", fetchMock);
    expect((await listAuthors()).items).toEqual([author]);
    expect((await getStep("bogle")).slug).toBe("bogle");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/steps/bogle");
  });

  it.each(ERAS)("accepts era %s and a missing author", async (era) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ ...step, era, author: null })),
    );
    expect(await getStep("bogle")).toMatchObject({ era, author: null });
  });

  it("validates the new page shape without the old size limit", () => {
    expect(
      isStepPage({
        content: [step],
        page: { number: 0, size: 200, totalElements: 1, totalPages: 1 },
      }),
    ).toBe(true);
    expect(
      isStepPage({
        items: [step],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      }),
    ).toBe(false);
    expect(
      isStepPage({
        content: [step],
        page: { number: 0, size: 0, totalElements: 1, totalPages: 1 },
      }),
    ).toBe(false);
    expect(isStep({ ...step, author: undefined })).toBe(false);
    expect(isStep({ ...step, slug: "Step_with spaces", name: "" })).toBe(true);
  });

  it("preserves the not-found error message and encodes slugs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { code: "STEP_NOT_FOUND", message: "Step not found" },
          { status: 404 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(getStep("step / name")).rejects.toMatchObject({
      kind: "http",
      status: 404,
      detail: "Step not found",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/v1/steps/step%20%2F%20name",
    );
  });

  it("preserves JSON error messages on HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            timestamp: "2026-10-01T12:56:24.245Z",
            status: 400,
            error: "Bad Request",
            path: "/api/v1/steps",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );
    await expect(listSteps(filters)).rejects.toMatchObject({
      kind: "http",
      status: 400,
      detail: "Bad Request",
    });
  });

  it("reports status even when an HTTP body is HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>Not found</html>", {
          status: 404,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );
    await expect(listSteps(filters)).rejects.toMatchObject({
      kind: "http",
      status: 404,
    });
  });

  it("rejects HTML, malformed JSON and invalid payloads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("<html>fallback</html>", {
          headers: { "Content-Type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("{broken", {
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          content: [{ ...step, era: "INVALID" }],
          page: { number: 0, size: 20, totalElements: 1, totalPages: 1 },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(listSteps(filters)).rejects.toMatchObject({
        kind: "invalid",
      });
    }
  });

  it("classifies network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(listAuthors()).rejects.toMatchObject({ kind: "network" });
  });

  it("classifies timeout and clears its timer", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    const pending = listAuthors();
    const result = expect(pending).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates caller cancellation without converting it to a network error", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    const pending = listAuthors(controller.signal);
    controller.abort();
    await expect(pending).rejects.not.toBeInstanceOf(ApiError);
  });
});
