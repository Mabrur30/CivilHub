const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow";

// White on primary passes AA; the brighter `glow` red does not, so hover
// darkens the button instead of lightening it.
export const primaryButtonBaseClassName = `inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-[#c81a29] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/50 disabled:active:scale-100 ${focusRing}`;

// Fit-content by default so it never stretches inside a flex column; use the
// base with `w-full` where a full-width button is wanted.
export const primaryButtonClassName = `${primaryButtonBaseClassName} w-fit`;

export const secondaryButtonClassName = `inline-flex w-fit shrink-0 items-center justify-center gap-2 rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white/80 transition-[border-color,color,transform] duration-200 hover:border-white/40 hover:text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

// Compact actions that sit inside a list row.
export const rowButtonClassName = `inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-sm font-semibold text-white/75 transition-[border-color,color,transform] hover:border-white/35 hover:text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

export const rowDangerButtonClassName = `inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-400/30 px-3.5 py-1.5 text-sm font-semibold text-red-200 transition-[background-color,transform] hover:bg-red-400/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

export const retryButtonClassName = `w-fit shrink-0 rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white active:scale-[0.98] ${focusRing}`;

// Red outline: an action that matters but isn't the page's one primary step,
// e.g. a row of "Hire" buttons where only the confirmation is solid red.
export const outlineButtonClassName = retryButtonClassName;

export const quietLinkClassName = `rounded-full text-sm font-semibold text-white/60 transition-colors hover:text-white ${focusRing}`;

// Names inside a sentence (a client, an engineer) stay quiet so the red accent
// is left for actions and warnings; the underline is what marks them as links.
export const inlineLinkClassName = `rounded text-white/80 underline decoration-white/25 underline-offset-4 transition-colors hover:text-white hover:decoration-white/70 ${focusRing}`;

export const panelClassName =
  "overflow-hidden rounded-2xl border border-white/10 bg-surface";

export const inputClassName =
  "w-full rounded-xl border border-white/15 bg-void px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus:border-primary";
