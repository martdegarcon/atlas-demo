"use client"

import { forwardRef, useEffect, useId, type RefObject, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react"
import { CaretDownIcon } from "./icons"

// Базовые элементы интерфейса — одни на весь проект, чтобы кнопки, поля и
// списки везде выглядели и вели себя одинаково.

export function cn(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ")
}

/* ---------- кнопки ---------- */

type Variant = "primary" | "secondary" | "danger"
const variants: Record<Variant, string> = {
  // главная кнопка — контрастная плашка: видно, что это действие, даже когда оно недоступно
  primary: "bg-foreground text-background hover:opacity-90 disabled:bg-foreground/12 disabled:text-foreground/35",
  secondary: "glass-tile text-foreground hover:bg-foreground/10 disabled:opacity-40",
  danger: "atlas-danger disabled:opacity-40",
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "md" | "lg"; icon?: ReactNode }>(
  function Button({ variant = "primary", size = "lg", icon, className, children, type = "button", ...rest }, ref) {
    return (
      <button ref={ref} type={type} {...rest}
        className={cn(
          "focus-ring inline-flex w-full items-center justify-center gap-2 rounded-full text-sm font-medium transition-[background,color,opacity] active:scale-[0.99] disabled:cursor-not-allowed disabled:active:scale-100",
          size === "lg" ? "h-12 px-5" : "h-11 px-4",
          variants[variant],
          className
        )}>
        {icon}
        {children}
      </button>
    )
  }
)

/* ---------- поля ---------- */

// 16px на телефоне: при меньшем шрифте iPhone увеличивает страницу при фокусе, и окно «съезжает»
const control = "atlas-input glass-tile w-full rounded-[16px] bg-transparent px-3 text-base md:text-sm text-foreground placeholder:text-muted-foreground"

export function FieldShell({ label, error, hint, htmlFor, children, className }: { label?: string; error?: string | null; hint?: ReactNode; htmlFor: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      {label && <label htmlFor={htmlFor} className="mb-1.5 block px-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</label>}
      {children}
      {error ? (
        <p id={htmlFor + "-msg"} role="alert" className="px-1 pt-1.5 text-[11px] leading-snug text-[var(--atlas-accent)]">{error}</p>
      ) : hint ? (
        <p id={htmlFor + "-msg"} className="px-1 pt-1.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

// messageHidden — поле только подсвечивается, а текст ошибки форма показывает сама (например, под всей строкой)
type FieldProps = { label?: string; error?: string | null; hint?: ReactNode; className?: string; messageHidden?: boolean }

export const TextField = forwardRef<HTMLInputElement, FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "className">>(
  function TextField({ label, error, hint, className, id, messageHidden, ...rest }, ref) {
    const auto = useId()
    const fid = id || auto
    const shown = !messageHidden && (error || hint)
    return (
      <FieldShell label={label} error={messageHidden ? null : error} hint={messageHidden ? null : hint} htmlFor={fid} className={className}>
        <input ref={ref} id={fid} aria-invalid={error ? true : undefined} aria-describedby={shown ? fid + "-msg" : undefined}
          {...rest} className={cn(control, "h-11")} />
      </FieldShell>
    )
  }
)

export function TextArea({ label, error, hint, className, id, rows = 3, maxLength, value, ...rest }: FieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">) {
  const auto = useId()
  const fid = id || auto
  const len = typeof value === "string" ? value.length : 0
  // счётчик появляется, только когда до лимита осталось немного
  const counter = maxLength && len > maxLength * 0.8 ? `${len} / ${maxLength}` : null
  return (
    <FieldShell label={label} error={error} hint={hint ?? counter} htmlFor={fid} className={className}>
      <textarea id={fid} rows={rows} maxLength={maxLength} value={value} aria-invalid={error ? true : undefined}
        {...rest} className={cn(control, "h-auto resize-none py-3 leading-relaxed")} />
    </FieldShell>
  )
}

// Нативный список (удобен на телефоне), но со своей стрелкой и отступами
export function Select({ label, className, id, children, ...rest }: { label?: string; className?: string } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "className">) {
  const auto = useId()
  const fid = id || auto
  return (
    <FieldShell label={label} htmlFor={fid} className={className}>
      <div className="relative">
        <select id={fid} {...rest} className={cn(control, "h-11 cursor-pointer appearance-none truncate pr-10")}>{children}</select>
        <CaretDownIcon size={16} className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
    </FieldShell>
  )
}

// Сегментный переключатель (город/страна, тема, язык, видимость)
export function Segmented<T extends string>({ value, options, onChange, label, size = "md" }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void; label?: string; size?: "sm" | "md" }) {
  return (
    <div role="group" aria-label={label} className="glass-tile flex gap-1 rounded-full p-1">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}
          className={cn("focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-full uppercase transition-colors",
            size === "sm" ? "py-1.5 text-[11px] tracking-[0.1em]" : "py-2 text-xs tracking-[0.12em]",
            value === o.id ? "glass-capsule text-foreground" : "text-muted-foreground hover:text-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Окна и шторки на телефоне: при открытой клавиатуре окно ужимается до
// видимой части экрана и стоит над клавиатурой, а не уезжает под неё
export function useFitVisualViewport(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null
    const el = ref.current
    if (!vv || !el || !active) return
    const fit = () => {
      const keyboard = window.innerHeight - vv.height > 80
      el.style.top = keyboard ? `${vv.offsetTop}px` : ""
      el.style.height = keyboard ? `${vv.height}px` : ""
      el.style.bottom = keyboard ? "auto" : ""
    }
    fit()
    vv.addEventListener("resize", fit)
    vv.addEventListener("scroll", fit)
    return () => { vv.removeEventListener("resize", fit); vv.removeEventListener("scroll", fit) }
  }, [ref, active])
}

// Ошибка под всей строкой полей
export function FieldError({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p role="alert" className="-mt-1.5 px-1 text-[11px] leading-snug text-[var(--atlas-accent)]">{children}</p>
}
