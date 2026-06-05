'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hmi-grid disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-hmi-btn text-hmi-text hover:bg-hmi-btn-hover',
        outline:
          'border border-hmi-grid bg-transparent text-hmi-text hover:bg-hmi-btn',
        ghost:
          'bg-transparent text-hmi-text hover:bg-hmi-btn',
        estop:
          'bg-hmi-estop text-white hover:bg-hmi-estop-hover font-bold',
        resume:
          'bg-hmi-ok text-white hover:bg-hmi-ok-hover font-bold',
      },
      size: {
        default: 'h-8 px-3 py-1',
        sm: 'h-7 px-2 text-xs',
        lg: 'h-9 px-4',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
