import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { Badge } from './Badge'

interface FieldProps {
  label: string
  error?: string
  hint?: string
  /** Receives the id to put on the control, so the label is wired to it. */
  children: (id: string) => ReactNode
}

export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p role="alert" className="text-xs font-medium text-loss">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-11 w-full rounded-lg border bg-white px-3 text-sm placeholder:text-muted',
        invalid ? 'border-2 border-loss' : 'border-control',
        className,
      )}
      {...rest}
    />
  )
})

export function CoreChip({ label }: { label: string }) {
  return <Badge className="h-6 px-2">{label}</Badge>
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { className, invalid, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn('h-11 w-full cursor-pointer rounded-lg border bg-white px-3 text-sm', invalid ? 'border-2 border-loss' : 'border-control', className)}
      {...rest}
    >
      {children}
    </select>
  )
})
