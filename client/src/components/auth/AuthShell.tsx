import { type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { MotionConfig, motion } from "framer-motion";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

interface AuthShellProps {
  children: ReactNode;
  /** Tailwind max-width class for the card column. */
  widthClassName?: string;
}

// Same curve and distance as the landing page's heading reveal, so moving from
// the homepage into auth feels like one site.
const ENTRANCE_EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Shared frame for Login and both Signup variants: the blueprint background,
 * the glass card, and the back-to-home links. Only the form inside differs.
 */
export function AuthShell({
  children,
  widthClassName = "max-w-lg",
}: AuthShellProps): ReactElement {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    // "user" drops transform animations (entrance offset, button scale) for
    // reduced-motion users while keeping opacity fades such as the focus ring.
    <MotionConfig reducedMotion="user">
      <main
        data-theme="dark"
        className="relative isolate flex min-h-screen items-center justify-center bg-void px-4 py-12 text-white sm:px-6">
        {/* Fixed so the tall Signup form scrolls over a still background
            instead of stretching the image to the document height. */}
        <div aria-hidden="true" className="fixed inset-0 -z-10">
          <img
            src="/signup.jfif"
            alt=""
            decoding="async"
            className="h-full w-full object-cover"
          />
          {/* The image is already dark through its centre, so the wash stays
              light there and only deepens at the edges — enough to seat the
              card without flattening the blueprint line work. */}
          <div className="absolute inset-0 bg-gradient-to-b from-void/55 via-void/20 to-void/70" />
        </div>

        {/* Reduced motion renders at the final state with no initial frame, so
            the card can never be left at opacity 0. */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.56, ease: ENTRANCE_EASE }}
          className={`w-full ${widthClassName} text-center`}
        >
          <div className="glass-panel rounded-[32px] p-6 sm:p-10">
            <Link
              to="/"
              aria-label="Back to home"
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-primary/60 bg-primary/10 text-lg font-bold text-primary transition-all duration-300 hover:-translate-y-0.5 hover:border-primary hover:bg-primary/15"
            >
              C
            </Link>
            {children}
          </div>
          <Link
            to="/"
            className="mt-5 inline-flex items-center gap-2 text-sm text-white/55 transition-colors duration-300 hover:text-primary"
          >
            <span aria-hidden="true">&larr;</span>
            <span>Back to home</span>
          </Link>
        </motion.div>
      </main>
    </MotionConfig>
  );
}
