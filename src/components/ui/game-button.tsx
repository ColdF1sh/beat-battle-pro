import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type GameButtonVariant = "primary" | "danger" | "secondary" | "dev";

const variantClassNames: Record<GameButtonVariant, string> = {
  primary:
    "bb-print-button border-fuchsia-300/55 bg-[linear-gradient(135deg,var(--bb-primary-violet),var(--bb-magenta))] text-white shadow-[7px_7px_0_rgba(0,0,0,0.62)] hover:bg-[linear-gradient(135deg,var(--bb-magenta),var(--bb-primary-violet))]",
  danger:
    "bb-print-button border-[var(--bb-danger)] bg-[linear-gradient(135deg,var(--bb-danger),var(--bb-rust))] text-[var(--bb-paper)] shadow-[7px_7px_0_rgba(0,0,0,0.68)] hover:bg-[linear-gradient(135deg,var(--bb-rust),var(--bb-danger))]",
  secondary:
    "bb-print-button border-white/14 bg-black/45 text-[var(--bb-paper)] shadow-[6px_6px_0_rgba(0,0,0,0.5)] hover:bg-white/[0.09]",
  dev: "bb-print-button border-violet-300/50 bg-[linear-gradient(135deg,var(--bb-primary-violet),var(--bb-secondary-cyan))] text-white shadow-[7px_7px_0_rgba(0,0,0,0.62)]",
};

export function gameButtonClassName(
  variant: GameButtonVariant = "primary",
  className?: string,
) {
  return cn(
    "inline-flex h-12 items-center justify-center gap-2 border px-6 text-sm font-black uppercase tracking-[0.16em] transition-[transform,filter] duration-150 ease-linear hover:-translate-x-1 hover:-translate-y-1 hover:skew-x-[-3deg] active:translate-x-0 active:translate-y-0 disabled:pointer-events-none disabled:opacity-50",
    variantClassNames[variant],
    className,
  );
}

export function GameButton({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: GameButtonVariant;
}) {
  return (
    <button
      className={gameButtonClassName(variant, className)}
      type="button"
      {...props}
    />
  );
}
