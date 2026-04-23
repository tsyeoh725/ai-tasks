import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "bg-indigo-400/15 text-indigo-200 border-indigo-400/20 [a]:hover:bg-indigo-400/25",
        secondary:
          "bg-white/[0.06] text-white/80 border-white/[0.08] [a]:hover:bg-white/[0.1]",
        destructive:
          "bg-red-400/10 text-red-300 border-red-400/20 focus-visible:ring-red-400/20 [a]:hover:bg-red-400/20",
        success:
          "bg-emerald-400/10 text-emerald-300 border-emerald-400/20 [a]:hover:bg-emerald-400/20",
        warning:
          "bg-amber-400/10 text-amber-300 border-amber-400/20 [a]:hover:bg-amber-400/20",
        outline:
          "border-white/[0.12] text-white/80 [a]:hover:bg-white/[0.05]",
        ghost:
          "text-white/60 hover:bg-white/[0.06] hover:text-white/80",
        link: "text-indigo-300 underline-offset-4 hover:underline hover:text-indigo-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
