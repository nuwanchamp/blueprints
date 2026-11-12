import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'md' | 'sm' | 'icon'
}

// Every size keeps a 44px tall hit area
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        size === 'md' ? 'px-5 text-sm' : size === 'icon' ? 'w-11 px-0' : 'px-3 text-[13px]',
        variant === 'primary'
          ? 'bg-ink text-white hover:bg-black'
          : variant === 'ghost'
            ? 'text-ink hover:bg-tint'
            : 'border border-control bg-white text-ink hover:bg-tint',
        className,
      )}
      {...rest}
    />
  )
})
