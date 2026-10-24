import * as React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-hmi-grid bg-hmi-bg px-2.5 text-[13px] text-hmi-text placeholder:text-hmi-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hmi-ideal focus-visible:ring-offset-2 focus-visible:ring-offset-hmi-bg disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export { Input }
