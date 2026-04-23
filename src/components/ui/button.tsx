import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-foreground backdrop-blur-xl",
        primary:
          "bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-[0_4px_20px_rgb(99_102_241/0.3)] hover:from-indigo-400 hover:to-cyan-400 hover:shadow-[0_4px_24px_rgb(99_102_241/0.45)] border border-white/10",
        outline:
          "border border-white/[0.12] bg-white/[0.03] hover:bg-white/[0.08] text-foreground backdrop-blur-xl",
        secondary:
          "bg-white/[0.05] text-foreground hover:bg-white/[0.09] border border-white/[0.06] backdrop-blur-xl",
        ghost:
          "hover:bg-white/[0.06] hover:text-foreground aria-expanded:bg-white/[0.08] aria-expanded:text-foreground",
        destructive:
          "bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-400/20 focus-visible:border-red-400/40 focus-visible:ring-red-400/20",
        link: "text-indigo-300 underline-offset-4 hover:underline hover:text-indigo-200",
      },
      size: {
        default:
          "h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-lg px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-lg px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-lg in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-lg in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
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
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
