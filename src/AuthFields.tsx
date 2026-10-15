import { useId, type ReactNode } from "react";
import { authErrorCopy } from "./auth-forms";

export function Field({
  label,
  name,
  value,
  onChange,
  error,
  type = "text",
  autoComplete,
  hint,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: "text" | "email" | "password";
  autoComplete: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        required
        autoComplete={autoComplete}
        autoCapitalize={type === "email" ? "none" : undefined}
        spellCheck={type === "email" ? false : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [error ? `${id}-error` : "", hint ? `${id}-hint` : ""]
            .filter(Boolean)
            .join(" ") || undefined
        }
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      {error && (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}

export function RequestFeedback({
  error,
  pending,
  remaining,
}: {
  error: unknown;
  pending: boolean;
  remaining: number;
}) {
  return (
    <>
      {pending && <p role="status">Выполняем запрос…</p>}
      {error !== undefined && (
        <p className="auth-message auth-message--error" role="alert">
          {authErrorCopy(error)}
        </p>
      )}
      {remaining > 0 && (
        <p className="form-hint">
          Повторить запрос можно через {remaining} сек.
        </p>
      )}
    </>
  );
}

export function Success({ children }: { children: ReactNode }) {
  return (
    <p className="auth-message auth-message--success" role="status">
      {children}
    </p>
  );
}
