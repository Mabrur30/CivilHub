import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "../Avatar";
import { Reveal } from "./Reveal";

interface TestimonialsProps {}

interface Testimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
  side: "client" | "engineer";
}

// FICTIONAL testimonials for launch — replace with real client/engineer reviews once available (see Review.model.ts)
//
// Every name, company and project below is invented. None of it describes a real
// customer, and none of it came from the database. Review.model.ts already stores
// `reviewText`, `rating`, `client` and `engineer`, so swapping this out means
// fetching real reviews and mapping those fields onto the Testimonial shape —
// there is no public reviews endpoint yet, which is why this array exists.
const FICTIONAL_TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "The structural review came back in two days instead of two weeks, because the drawings and the comments sat in the same place. We cleared the milestone without a single phone call.",
    name: "Nusrat Jahan",
    role: "Project Director",
    company: "Southpoint Structures",
    side: "client",
  },
  {
    quote:
      "We had four qualified bids on a culvert replacement inside a week. Two of them had built the same span before, which I would never have turned up through our usual contacts.",
    name: "Arif Mahmud",
    role: "Procurement Lead",
    company: "Vantage Build Group",
    side: "client",
  },
  {
    quote:
      "Mobilization held to the date we agreed on. Having the approval chain visible meant nobody spent a week waiting on a document they did not know existed.",
    name: "Farhana Siddique",
    role: "Infrastructure Manager",
    company: "Crestline Developments",
    side: "client",
  },
  {
    quote:
      "The briefs state the soil conditions and the deadline up front, so I can tell inside a minute whether a job is worth bidding. I stopped writing proposals for projects that were never a fit.",
    name: "Rezaul Karim",
    role: "Principal Engineer",
    company: "Grid & Span Consulting",
    side: "engineer",
  },
  {
    quote:
      "Every RFI on the embankment job stayed on one thread with the client. When the variance came up at close-out we had the whole record, and the conversation took ten minutes.",
    name: "Tahmid Anwar",
    role: "Geotechnical Lead",
    company: "Baseline Civil Partners",
    side: "engineer",
  },
  {
    quote:
      "Handover used to mean chasing certificates by email for a month. We filed the as-builts and the compliance set together and the signoff came through that same week.",
    name: "Shirin Akter",
    role: "Site Engineer",
    company: "Wayfare Infrastructure",
    side: "engineer",
  },
];

function TestimonialCard({
  testimonial,
}: {
  testimonial: Testimonial;
}): ReactElement {
  const isClient = testimonial.side === "client";

  return (
    <figure className="flex w-[82vw] shrink-0 snap-start flex-col rounded-2xl border border-white/10 bg-surface p-6 sm:w-[360px]">
      <span
        className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
          isClient ? "bg-primary/15 text-primary" : "bg-white/10 text-white/70"
        }`}
      >
        {isClient ? "Client" : "Engineer"}
      </span>

      <blockquote className="mt-5 flex-1 font-heading text-lg leading-[1.6] text-white/90">
        {testimonial.quote}
      </blockquote>

      <figcaption className="mt-6 flex items-center gap-3 border-t border-white/10 pt-5">
        <Avatar name={testimonial.name} size="sm" />

        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{testimonial.name}</p>
          <p className="text-xs leading-5 text-white/50">
            {testimonial.role}
            <br />
            {testimonial.company}
          </p>
        </div>
      </figcaption>
    </figure>
  );
}

export function Testimonials(_props: TestimonialsProps): ReactElement {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollOn, setCanScrollOn] = useState(true);

  const syncScrollState = useCallback((): void => {
    const track = trackRef.current;
    if (!track) return;

    const maxScroll = track.scrollWidth - track.clientWidth;
    setCanScrollBack(track.scrollLeft > 8);
    setCanScrollOn(track.scrollLeft < maxScroll - 8);
  }, []);

  useEffect(() => {
    syncScrollState();
    window.addEventListener("resize", syncScrollState);
    return () => window.removeEventListener("resize", syncScrollState);
  }, [syncScrollState]);

  const scrollByCard = (direction: 1 | -1): void => {
    const track = trackRef.current;
    if (!track) return;

    const card = track.firstElementChild as HTMLElement | null;
    const step = card ? card.offsetWidth + 16 : track.clientWidth * 0.8;
    track.scrollBy({ left: step * direction, behavior: "smooth" });
  };

  return (
    <section
      id="testimonials"
      className="bg-void px-4 py-20 sm:px-6 lg:px-8"
      aria-roledescription="carousel"
      aria-label="What clients and engineers say"
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <Reveal variant="head" className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">
              From both sides
            </p>
            <h2 className="mt-4 font-heading text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
              What delivery looks like when nothing gets lost.
            </h2>
          </Reveal>

          <div className="flex shrink-0 gap-3">
            <button
              type="button"
              onClick={() => scrollByCard(-1)}
              disabled={!canScrollBack}
              aria-label="Previous testimonials"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white transition-all duration-300 hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-white/15 disabled:hover:text-white"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              onClick={() => scrollByCard(1)}
              disabled={!canScrollOn}
              aria-label="Next testimonials"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white transition-all duration-300 hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-white/15 disabled:hover:text-white"
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        </div>

        <Reveal className="mt-12">
          <div
            ref={trackRef}
            onScroll={syncScrollState}
            tabIndex={0}
            className="scrollbar-hidden flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto pb-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow"
          >
            {FICTIONAL_TESTIMONIALS.map((testimonial) => (
              <TestimonialCard
                key={testimonial.name}
                testimonial={testimonial}
              />
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
