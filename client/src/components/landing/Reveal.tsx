import { type ElementType, type ReactElement, type ReactNode } from "react";
import { useReveal } from "../../hooks/useReveal";

export interface RevealProps {
  children: ReactNode;
  /** "head" uses the shorter, slower travel tuned for large Playfair headings. */
  variant?: "head" | "default";
  /** Milliseconds, for staggering siblings within one group. */
  delay?: number;
  as?: ElementType;
  className?: string;
}

export function Reveal({
  children,
  variant = "default",
  delay = 0,
  as: Tag = "div",
  className = "",
}: RevealProps): ReactElement {
  const { ref, revealed } = useReveal<HTMLElement>();

  const variantClass = variant === "head" ? "reveal-head" : "reveal";

  return (
    <Tag
      ref={ref}
      className={`${variantClass}${revealed ? " reveal-in" : ""} ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
