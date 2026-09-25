import {
  type FocusEvent,
  type InputHTMLAttributes,
  type ReactElement,
  useState,
} from "react";
import { motion } from "framer-motion";
import { EyeIcon, EyeSlashIcon, type Icon } from "@phosphor-icons/react";

interface GlassFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  id: string;
  label: string;
  icon: Icon;
}

/**
 * Label + glass input. Every input attribute passes straight through, so each
 * page keeps its own ids, names, handlers and validation attributes.
 * Password fields get a show/hide toggle that only swaps the input type.
 */
export function GlassField({
  id,
  label,
  icon: LeadingIcon,
  type = "text",
  ...inputProps
}: GlassFieldProps): ReactElement {
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const isPassword = type === "password";

  // Focus moving between the input and its own toggle keeps the ring lit.
  const handleBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsFocused(false);
    }
  };

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-semibold text-white/80"
      >
        {label}
      </label>
      <div
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        className="glass-field group flex items-center rounded-2xl"
      >
        <LeadingIcon
          aria-hidden="true"
          size={18}
          className="pointer-events-none ml-4 shrink-0 text-white/40 transition-colors duration-200 group-focus-within:text-glow"
        />
        <input
          id={id}
          type={isPassword && isRevealed ? "text" : type}
          {...inputProps}
          className={`w-full min-w-0 rounded-2xl bg-transparent py-3 pl-3 text-base text-white placeholder:text-white/35 focus:outline-none ${isPassword ? "pr-2" : "pr-4"}`}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setIsRevealed((current) => !current)}
            aria-label={isRevealed ? "Hide password" : "Show password"}
            aria-pressed={isRevealed}
            className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/45 transition-colors duration-200 hover:text-white focus-visible:text-white focus-visible:outline-none"
          >
            {isRevealed ? (
              <EyeSlashIcon aria-hidden="true" size={18} />
            ) : (
              <EyeIcon aria-hidden="true" size={18} />
            )}
          </button>
        ) : null}
        <motion.span
          aria-hidden="true"
          initial={false}
          animate={{ opacity: isFocused ? 1 : 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="glass-field-focus"
        />
      </div>
    </div>
  );
}
