"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

export function PageShell({
  title,
  back,
  children,
}: {
  title: string;
  back?: { href: string; label?: string };
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-8">
      {back && (
        <Link href={back.href} className="text-sm text-zinc-500">
          ← {back.label ?? "뒤로"}
        </Link>
      )}
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </main>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const styles = {
    primary:
      "bg-zinc-900 text-white disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:disabled:bg-zinc-700",
    secondary:
      "border border-zinc-300 bg-white text-zinc-900 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
    danger: "bg-red-600 text-white disabled:bg-red-300",
    ghost:
      "text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-300",
  }[variant];
  return (
    <button
      type="button"
      className={`rounded-lg px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function TextField({
  label,
  hint,
  error,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none focus:border-zinc-900 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100 dark:disabled:bg-zinc-800"
        aria-invalid={!!error}
        {...props}
      />
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

/** 비밀번호 마스킹 + 보기 토글 (명세 2.1) */
export function PasswordField(
  props: Omit<React.ComponentProps<typeof TextField>, "type">,
) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <TextField {...props} type={shown ? "text" : "password"} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        className="absolute top-8 right-2 px-2 py-1.5 text-xs text-zinc-500"
        aria-label={shown ? "비밀번호 숨기기" : "비밀번호 보기"}
      >
        {shown ? "숨기기" : "보기"}
      </button>
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  children,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex-1">{label}</span>
      {children}
    </label>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "success" | "warning";
  children: ReactNode;
}) {
  const styles = {
    info: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
    error: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200",
    success: "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200",
    warning: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg px-3 py-2 text-sm ${styles}`}
    >
      {children}
    </div>
  );
}

export function Card({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      {title && <h2 className="text-base font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export const ROLE_LABEL = {
  TRAINER: "트레이너",
  STUDENT: "수강생",
  CENTER_ADMIN: "센터 관리자",
} as const;
export type RoleKey = keyof typeof ROLE_LABEL;

export function RoleTabs({
  value,
  onChange,
}: {
  value: RoleKey | null;
  onChange: (r: RoleKey) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="회원 유형"
      className="grid grid-cols-3 gap-2"
    >
      {(Object.keys(ROLE_LABEL) as RoleKey[]).map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={value === r}
          onClick={() => onChange(r)}
          className={`rounded-lg border px-2 py-2.5 text-sm ${
            value === r
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              : "border-zinc-300 dark:border-zinc-700"
          }`}
        >
          {ROLE_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

/** 화면 위에 뜨는 시트/팝업 (모바일은 아래에서, PC는 가운데) */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="닫기"
            className="px-2 text-xl text-zinc-500"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
