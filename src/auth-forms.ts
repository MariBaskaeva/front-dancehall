import { useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

export const EMAIL_NOTICE =
  "Проверьте почту. Если письмо не пришло, попробуйте запросить его повторно";
export const INVALID_LINK =
  "Ссылка недействительна или срок её действия истёк. Запросите новую ссылку.";

export function authErrorCopy(error: unknown): string {
  if (!(error instanceof ApiError))
    return "Нет связи с сервером. Проверьте подключение и попробуйте ещё раз.";
  if (error.kind === "network")
    return "Нет связи с сервером. Проверьте подключение и попробуйте ещё раз.";
  if (error.kind === "timeout")
    return "Сервер не ответил за 10 секунд. Попробуйте ещё раз.";
  if (error.kind === "invalid")
    return "Неожиданный ответ сервера. Попробуйте позже.";
  const messages: Record<string, string> = {
    VALIDATION_ERROR: "Проверьте заполненные поля и попробуйте ещё раз.",
    INVALID_OR_EXPIRED_TOKEN: INVALID_LINK,
    INVALID_CREDENTIALS: "Неверный email или пароль.",
    EMAIL_NOT_VERIFIED:
      "Подтвердите email перед входом. Можно запросить письмо повторно.",
    AUTHENTICATION_REQUIRED: "Сессия завершилась. Войдите снова.",
    CSRF_INVALID: "Не удалось подтвердить запрос. Попробуйте ещё раз.",
    UNSUPPORTED_MEDIA_TYPE:
      "Сервер не смог обработать запрос. Попробуйте позже.",
    TOO_MANY_REQUESTS:
      "Слишком много запросов. Подождите перед следующей попыткой.",
    INTERNAL_SERVER_ERROR: "Сервис временно недоступен. Попробуйте ещё раз.",
  };
  if (error.status === 429) return messages.TOO_MANY_REQUESTS;
  return (
    messages[error.code ?? ""] ??
    "Не удалось выполнить запрос. Попробуйте ещё раз."
  );
}

export const normalizeEmail = (value: string) => value.trim().toLowerCase();
const length = (value: string) => [...value].length;

export function emailError(value: string): string | undefined {
  const email = normalizeEmail(value);
  if (
    !email ||
    email.length > 254 ||
    !/^[^\s@<>(),;:"[\]\\]+@[^\s@<>(),;:"[\]\\]+\.[^\s@<>(),;:"[\]\\]+$/.test(
      email,
    )
  )
    return "Введите корректный email длиной до 254 символов.";
}

export function nameError(value: string): string | undefined {
  if (length(value.trim()) < 1 || length(value.trim()) > 100)
    return "Введите имя длиной от 1 до 100 символов.";
}

export function passwordError(value: string, isNew = true): string | undefined {
  if (length(value) < (isNew ? 15 : 1) || length(value) > 128)
    return isNew
      ? "Пароль должен содержать от 15 до 128 символов."
      : "Введите пароль длиной до 128 символов.";
}

export function confirmationError(
  password: string,
  confirmation: string,
): string | undefined {
  if (password !== confirmation) return "Пароли не совпадают.";
}

export function useCooldown() {
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(Date.now);
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  useEffect(() => {
    if (!deadline) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [deadline]);
  function start(seconds: number) {
    const current = Date.now();
    setNow(current);
    setDeadline((previous) => Math.max(previous, current + seconds * 1000));
  }
  return { remaining, start };
}

export function useSubmission() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const cooldown = useCooldown();
  const locked = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function run(
    action: () => Promise<unknown>,
    onSuccess: () => void,
    emailRequest = false,
  ) {
    if (locked.current || cooldown.remaining > 0) return;
    locked.current = true;
    setPending(true);
    setError(undefined);
    try {
      await action();
      if (mounted.current) {
        if (emailRequest) cooldown.start(60);
        onSuccess();
      }
    } catch (failure) {
      if (mounted.current) {
        setError(failure);
        if (failure instanceof ApiError && failure.status === 429)
          cooldown.start(
            Math.max(emailRequest ? 60 : 1, failure.retryAfter ?? 60),
          );
      }
    } finally {
      locked.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return { pending, error, remaining: cooldown.remaining, run };
}

export function useFormErrors() {
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  function validate(
    form: HTMLFormElement,
    next: Record<string, string | undefined>,
  ) {
    setErrors(next);
    const invalid = Object.keys(next).find((key) => next[key]);
    if (invalid) {
      const input = form.elements.namedItem(invalid);
      if (input instanceof HTMLElement) input.focus();
      return false;
    }
    return true;
  }
  return { errors, validate };
}
