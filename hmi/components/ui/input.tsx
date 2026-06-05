import * as React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-7 w-full rounded border border-hmi-grid bg-hmi-bg px-2 py-1 text-sm text-hmi-text placeholder:text-hmi-muted focus:outline-none focus:ring-1 focus:ring-hmi-tab-active disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export { Input }
