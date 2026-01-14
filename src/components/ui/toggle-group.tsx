import type { JSX, ValidComponent } from "solid-js"
import { createContext, splitProps, useContext } from "solid-js"

import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import * as ToggleGroupPrimitive from "@kobalte/core/toggle-group"
import type { VariantProps } from "class-variance-authority"

import { cn } from "~/lib/utils"
import { toggleVariants } from "~/components/ui/toggle"

const ToggleGroupContext = createContext<VariantProps<typeof toggleVariants>>({
  size: "default",
  variant: "default"
})

type ToggleGroupRootProps<T extends ValidComponent = "div"> =
  ToggleGroupPrimitive.ToggleGroupRootProps<T> &
    VariantProps<typeof toggleVariants> & { class?: string | undefined; children?: JSX.Element }

const ToggleGroup = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, ToggleGroupRootProps<T>>
) => {
  const [local, others] = splitProps(props as ToggleGroupRootProps, [
    "class",
    "children",
    "size",
    "variant"
  ])

  return (
    <ToggleGroupPrimitive.Root
      class={cn(
        "flex items-center justify-center gap-1 rounded-2xl border border-border bg-card/55 p-1 shadow-[0_1px_0_rgba(0,0,0,0.04)]",
        local.class
      )}
      {...others}
    >
      <ToggleGroupContext.Provider
        value={{
          get size() {
            return local.size
          },
          get variant() {
            return local.variant
          }
        }}
      >
        {local.children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

type ToggleGroupItemProps<T extends ValidComponent = "button"> =
  ToggleGroupPrimitive.ToggleGroupItemProps<T> &
    VariantProps<typeof toggleVariants> & { class?: string | undefined }

const ToggleGroupItem = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, ToggleGroupItemProps<T>>
) => {
  const [local, others] = splitProps(props as ToggleGroupItemProps, ["class", "size", "variant"])
  const context = useContext(ToggleGroupContext)
  return (
    <ToggleGroupPrimitive.Item
      class={cn(
        toggleVariants({
          size: context.size || local.size,
          variant: context.variant || local.variant
        }),
        "hover:bg-accent/15 hover:text-foreground data-[pressed]:bg-accent data-[pressed]:text-accent-foreground data-[pressed]:shadow-[0_1px_0_rgba(0,0,0,0.06)]",
        local.class
      )}
      {...others}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }
