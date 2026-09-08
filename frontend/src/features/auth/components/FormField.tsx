import { lt, useLocale } from '@/i18n'
import { useId, type InputHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
}

export function FormField({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: FormFieldProps) {
  useLocale()
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`

  return (
    <label htmlFor={inputId} className="block">
      <span className="mb-2 block text-sm font-semibold text-luma-teal-900">
        {lt(label)}
      </span>
      <input
        id={inputId}
        className={cn(
          'min-h-12 w-full rounded-2xl border bg-white px-4 text-base text-luma-ink outline-none transition-[border-color,box-shadow]',
          'placeholder:text-luma-muted/60 focus:border-luma-teal-500 focus:ring-3 focus:ring-luma-teal-100',
          error ? 'border-red-400' : 'border-luma-ivory-200',
          className,
        )}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        {...props}
      />
      {error ? (
        <span id={errorId} className="mt-1.5 block text-sm text-red-600">
          {lt(error)}
        </span>
      ) : hint ? (
        <span id={hintId} className="mt-1.5 block text-xs text-luma-muted">
          {lt(hint)}
        </span>
      ) : null}
    </label>
  )
}
