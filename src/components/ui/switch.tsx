"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  thumbClassName,
  ...props
}: SwitchPrimitive.Root.Props & { thumbClassName?: string }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-gray-300 bg-gray-200 p-0.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/30 disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-indigo-500 data-[checked]:border-indigo-500",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.4)] ring-0 transition-transform translate-x-0 data-[checked]:translate-x-4",
          thumbClassName
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
