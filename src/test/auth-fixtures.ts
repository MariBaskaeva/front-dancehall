export const user = {
  id: "4b029f20-5a26-4ad8-8377-0a1d7c6e80ad",
  email: "dancer@example.com",
  name: "Ярослав",
};
export const password = "  Dancehall steps are fun!  ";
export const emptyPage = {
  content: [],
  page: { number: 0, size: 20, totalElements: 0, totalPages: 0 },
};
export const csrf = (token = "csrf-token") =>
  Response.json({ token, headerName: "X-CSRF-TOKEN" });
export const authError = (code: string, status: number, retryAfter?: string) =>
  Response.json(
    { code, message: "Backend message must not be displayed" },
    {
      status,
      headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
    },
  );
export const guest = () => authError("AUTHENTICATION_REQUIRED", 401);
