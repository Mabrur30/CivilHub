import { type ReactElement, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowRightIcon } from "@phosphor-icons/react";

interface GlassSubmitButtonProps {
  children: ReactNode;
  disabled?: boolean;
}

const RESTING_SHADOW =
  "0 14px 32px -12px rgba(225, 29, 46, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.22)";
// The shadow pulls in as the button sinks, so it reads as pressing toward the
// card rather than just shrinking.
const HOVER_SHADOW =
  "0 8px 22px -10px rgba(255, 59, 78, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.28)";
const PRESS_SHADOW =
  "0 4px 12px -6px rgba(255, 59, 78, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.18)";

const SPRING = { type: "spring", stiffness: 420, damping: 30 } as const;

/**
 * Primary submit for the auth forms. Keeps the solid primary-to-glow fill so it
 * stays the unmistakable CTA; the glass reference contributes only the feel of
 * the hover and press.
 */
export function GlassSubmitButton({
  children,
  disabled = false,
}: GlassSubmitButtonProps): ReactElement {
  return (
    <motion.button
      type="submit"
      disabled={disabled}
      initial={false}
      animate={{ boxShadow: RESTING_SHADOW }}
      whileHover={disabled ? undefined : "hover"}
      whileTap={disabled ? undefined : "press"}
      variants={{
        hover: { scale: 0.985, boxShadow: HOVER_SHADOW },
        press: { scale: 0.965, boxShadow: PRESS_SHADOW },
      }}
      transition={SPRING}
      className={`flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-glow px-5 py-3.5 text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow ${disabled ? "cursor-wait opacity-60" : "cursor-pointer"}`}
    >
      <span>{children}</span>
      {disabled ? null : (
        <motion.span
          aria-hidden="true"
          variants={{ hover: { x: 3 }, press: { x: 3 } }}
          transition={SPRING}
          className="flex"
        >
          <ArrowRightIcon size={18} weight="bold" />
        </motion.span>
      )}
    </motion.button>
  );
}
