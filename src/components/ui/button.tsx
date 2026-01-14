import type { JSX, ValidComponent } from "solid-js"
import { splitProps } from "solid-js"

import * as ButtonPrimitive from "@kobalte/core/button"
import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

import { cn } from "~/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-[transform,box-shadow,background-color,border-color,color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_0_rgba(0,0,0,0.05),0_18px_50px_-40px_rgba(0,0,0,0.6)] hover:-translate-y-0.5 hover:bg-primary/92 hover:shadow-[0_1px_0_rgba(0,0,0,0.05),0_22px_60px_-42px_rgba(0,0,0,0.62)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_1px_0_rgba(0,0,0,0.05),0_18px_50px_-40px_rgba(0,0,0,0.6)] hover:-translate-y-0.5 hover:bg-destructive/92",
        outline:
          "border border-border bg-card/70 text-foreground shadow-[0_1px_0_rgba(0,0,0,0.04),0_16px_40px_-38px_rgba(0,0,0,0.55)] hover:-translate-y-0.5 hover:bg-accent/25 hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[0_1px_0_rgba(0,0,0,0.05),0_18px_50px_-40px_rgba(0,0,0,0.6)] hover:-translate-y-0.5 hover:bg-secondary/88",
        ghost: "bg-transparent hover:bg-accent/20 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 px-3 text-xs",
        lg: "h-11 px-8 text-base",
        icon: "size-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

type ButtonProps<T extends ValidComponent = "button"> = ButtonPrimitive.ButtonRootProps<T> &
  VariantProps<typeof buttonVariants> & { class?: string | undefined; children?: JSX.Element }

const Button = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, ButtonProps<T>>
) => {
  const [local, others] = splitProps(props as ButtonProps, ["variant", "size", "class"])
  return (
    <ButtonPrimitive.Root
      class={cn(buttonVariants({ variant: local.variant, size: local.size }), local.class)}
      {...others}
    />
  )
}

export { Button, buttonVariants }
export type { ButtonProps }
