import { type ReactElement } from "react";

// Line drawing in the spirit of Fiverr's inbox illustration: a site plan sheet
// and two speech bubbles, drawn with the ink colour so it follows the theme.
export function InboxEmptyState(): ReactElement {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <svg
        viewBox="0 0 240 150"
        className="h-36 w-auto max-w-full"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <g className="stroke-white/40">
          <path d="M20 132h200" />
          <rect x="54" y="62" width="76" height="58" rx="4" />
          <path d="M54 78h76M72 62v58M100 94h30M100 94v26" />
          <path d="M142 22h66a8 8 0 0 1 8 8v26a8 8 0 0 1-8 8h-38l-14 12v-12h-14a8 8 0 0 1-8-8V30a8 8 0 0 1 8-8Z" />
          <path d="M24 30h52a8 8 0 0 1 8 8v18a8 8 0 0 1-8 8H50l-12 10V64H24a8 8 0 0 1-8-8V38a8 8 0 0 1 8-8Z" />
          <path d="M28 44h40M28 52h26" />
        </g>
        <g className="stroke-primary">
          <path d="M156 38h44M156 48h28" />
          <path d="M72 78h28v16H72z" className="fill-primary/15" />
        </g>
      </svg>
      <h2 className="mt-6 font-heading text-2xl font-bold text-white">
        Pick up where you left off
      </h2>
      <p className="mt-1.5 text-sm text-white/55">
        Select a conversation to keep talking.
      </p>
    </div>
  );
}
