import { type ReactElement } from "react";
import { useParallax } from "../../hooks/useParallax";
import { Reveal } from "./Reveal";

interface MissionSectionProps {}

export function MissionSection(_props: MissionSectionProps): ReactElement {
  // Scale here must stay in step with the `scale-135` class on the layer below:
  // the hook clamps the drift to the overflow that scale provides.
  const imageRef = useParallax<HTMLDivElement>(0.18, 1.35);

  return (
    <section
      id="mission"
      data-theme="dark"
      className="relative isolate overflow-hidden bg-void"
    >
      {/* Scaled past the frame so the parallax translate never exposes an edge. */}
      <div
        ref={imageRef}
        aria-hidden="true"
        className="absolute inset-0 scale-135 will-change-transform"
      >
        <img
          src="/rebar-mesh.jpg"
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </div>

      {/* Fades into bg-void at both edges so the photo reads as a break in the
          page rather than a banner pasted onto it. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-void via-void/60 to-void"
      />
      {/* Kept low: the rebar's rust tones and the primary orange are close enough
          that a heavier wash turns the steel muddy brown. */}
      <div aria-hidden="true" className="absolute inset-0 bg-primary/5" />

      <div className="relative mx-auto flex max-w-4xl items-center justify-center px-4 py-28 sm:px-6 sm:py-36 lg:px-8">
        <Reveal variant="head">
          <p className="text-center font-heading text-4xl font-bold leading-[1.14] text-white sm:text-5xl lg:text-6xl">
            Infrastructure is built on coordination long before it is built on
            concrete.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
