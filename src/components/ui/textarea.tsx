import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-900 shadow-sm transition-colors outline-none placeholder:text-gray-400 hover:border-gray-300 focus-visible:border-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-400/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50 aria-invalid:border-red-400 aria-invalid:ring-2 aria-invalid:ring-red-400/20",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
