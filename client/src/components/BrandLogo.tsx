import { type CSSProperties, type ReactElement } from "react";

// Proportions measured from the original logo artwork (public/civilhub logo.png),
// as fractions of the mark's height, so the lockup matches it at any size.
const MARK_ASPECT = 0.9238;
const WORD_ASPECT = 4.8;
const WORD_HEIGHT = 0.5464;
const WORD_TOP = 0.1954;
const GAP = 0.106;

interface BrandLogoProps {
  /** Height of the orange mark in pixels; the lettering scales with it. */
  height?: number;
  /** Mark only, for tight spaces. */
  markOnly?: boolean;
  className?: string;
}

/**
 * The CivilHub logo. The orange mark keeps its own colours; the "CivilHub"
 * lettering is a mask filled with the ink colour (`bg-white`), so it reads
 * charcoal in light mode and white in dark mode, including subtrees pinned
 * to one theme.
 */
export function BrandLogo({
  height = 34,
  markOnly = false,
  className = "",
}: BrandLogoProps): ReactElement {
  const wordHeight = height * WORD_HEIGHT;
  const wordmarkStyle: CSSProperties = {
    width: wordHeight * WORD_ASPECT,
    height: wordHeight,
    marginTop: height * WORD_TOP,
    marginLeft: height * GAP,
    maskImage: "url(/brand/civilhub-wordmark.png)",
    WebkitMaskImage: "url(/brand/civilhub-wordmark.png)",
    maskSize: "100% 100%",
    WebkitMaskSize: "100% 100%",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
  };

  return (
    <span
      role="img"
      aria-label="CivilHub"
      className={`inline-flex shrink-0 items-start ${className}`}
    >
      <img
        src="/brand/civilhub-mark.png"
        alt=""
        width={Math.round(height * MARK_ASPECT)}
        height={height}
        className="block shrink-0"
        style={{ width: height * MARK_ASPECT, height }}
        draggable={false}
      />
      {markOnly ? null : (
        <span aria-hidden="true" className="block bg-white" style={wordmarkStyle} />
      )}
    </span>
  );
}
