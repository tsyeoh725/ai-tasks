import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-base text-foreground transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-white/40 hover:bg-white/[0.05] focus-visible:border-white/[0.16] focus-visible:ring-3 focus-visible:ring-indigo-400/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:opacity-50 aria-invalid:border-red-400/50 aria-invalid:ring-3 aria-invalid:ring-red-400/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
