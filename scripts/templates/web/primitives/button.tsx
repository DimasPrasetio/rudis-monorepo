import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

import { Spinner } from "@/shared/components/primitives/spinner"

// Bingkai Navy button. Variant names stay shadcn's (components the shadcn CLI adds call
// them); outline and secondary are the same bordered "secondary" button.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 outline-none select-none active:translate-y-px focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-95",
        outline:
          "border border-input bg-card text-foreground shadow-(--shadow-card) hover:bg-accent hover:text-accent-foreground",
        secondary:
          "border border-input bg-card text-foreground shadow-(--shadow-card) hover:bg-accent hover:text-accent-foreground",
        ghost: "text-primary hover:bg-accent",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 text-sm",
        xs: "h-7 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 px-3 text-sm",
        lg: "h-11 px-5 text-base",
        icon: "size-9",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Shows a spinner and disables the button while an action runs. */
    loading?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Spinner aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
