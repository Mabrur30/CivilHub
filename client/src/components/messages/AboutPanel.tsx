import { StarIcon, XIcon } from "@phosphor-icons/react";
import { type ReactElement, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatCurrency } from "../../lib/format";
import { Avatar } from "../Avatar";
import { API_BASE_URL } from "./api";
import { type Participant } from "./types";

interface AboutRow {
  label: string;
  value: ReactElement | string;
}

interface AboutData {
  bio: string;
  rows: AboutRow[];
}

type Json = Record<string, unknown>;

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const rateRange = (min: number | null, max: number | null): string | null => {
  if (min !== null && max !== null && min !== max) {
    return `${formatCurrency(min)} – ${formatCurrency(max)}`;
  }
  const single = min ?? max;
  return single !== null ? formatCurrency(single) : null;
};

// The public-profile endpoint returns different shapes for engineers and
// clients; the panel only needs a handful of label/value pairs from either.
const toAboutData = (body: Json): AboutData => {
  const rows: AboutRow[] = [];
  const push = (label: string, value: ReactElement | string | null): void => {
    if (value !== null) rows.push({ label, value });
  };

  push("From", text(body.location) ?? text(body.derivedLocation));

  if (body.role === "engineer") {
    const rating = num(body.rating);
    const reviews = num(body.reviewCount) ?? 0;
    push(
      "Rating",
      rating !== null ? (
        <span className="inline-flex items-center gap-1">
          <StarIcon
            className="h-3.5 w-3.5 text-amber-300"
            weight="fill"
            aria-hidden="true"
          />
          {rating.toFixed(1)}
          <span className="text-white/45">({reviews})</span>
        </span>
      ) : (
        "No reviews yet"
      ),
    );
    push(
      "Typical rate",
      rateRange(num(body.startingRateMin), num(body.startingRateMax)) ??
        rateRange(num(body.rateMin), num(body.rateMax)),
    );
    const won = num(body.acceptedBidCount);
    push("Bids won", won !== null ? String(won) : null);
    push(
      "Completed projects",
      Array.isArray(body.completedWork)
        ? String(body.completedWork.length)
        : null,
    );
  } else {
    push("Company", text(body.companyName));
    const since = text(body.memberSince);
    push(
      "On CivilHub since",
      since
        ? new Date(since).toLocaleDateString(undefined, {
            month: "short",
            year: "numeric",
          })
        : null,
    );
    const stats = (
      typeof body.stats === "object" && body.stats !== null ? body.stats : {}
    ) as Json;
    const posted = num(stats.projectsPosted);
    push("Projects posted", posted !== null ? String(posted) : null);
    const completed = num(body.completedProjects);
    push("Completed projects", completed !== null ? String(completed) : null);
    const hireRate = num(stats.hireRate);
    push("Hire rate", hireRate !== null ? `${hireRate}%` : null);
  }

  return { bio: text(body.bio) ?? "", rows };
};

interface AboutPanelProps {
  participant: Participant;
  /** Shown as a drawer on narrower screens, with a close button. */
  onClose?: () => void;
}

export function AboutPanel({
  participant,
  onClose,
}: AboutPanelProps): ReactElement {
  const [data, setData] = useState<AboutData | null>(null);
  const [failed, setFailed] = useState<boolean>(false);

  useEffect(() => {
    // Keyed by user ID in ThreadView, so each person starts from empty state.
    let isCancelled = false;

    fetch(`${API_BASE_URL}/api/users/${participant.userId}/public-profile`, {
      credentials: "include",
    })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (isCancelled) return;
        if (!response.ok || typeof body !== "object" || body === null) {
          setFailed(true);
          return;
        }
        setData(toAboutData(body as Json));
      })
      .catch(() => {
        if (!isCancelled) setFailed(true);
      });

    return () => {
      isCancelled = true;
    };
  }, [participant.userId]);

  const profilePath = `/profile/${participant.userId}`;

  return (
    <aside
      aria-label={`About ${participant.name}`}
      className="flex h-full min-h-0 flex-col overflow-y-auto bg-surface"
    >
      <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-5">
        <h2 className="text-base font-semibold text-white">
          About{" "}
          <Link
            to={profilePath}
            className="underline decoration-white/25 underline-offset-4 hover:decoration-white/70"
          >
            {participant.name}
          </Link>
        </h2>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="-mr-1 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-white/55 hover:bg-white/5 hover:text-white"
          >
            <XIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-3 px-5">
        <Avatar
          name={participant.name}
          photoUrl={participant.profilePhotoUrl}
          size="sm"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {participant.name}
          </p>
          <p className="text-xs capitalize text-white/55">{participant.role}</p>
        </div>
      </div>

      <div className="mx-5 my-5 h-px bg-white/10" />

      {failed ? (
        <p className="px-5 text-sm text-white/55">
          Profile details aren't available right now.
        </p>
      ) : data === null ? (
        <dl className="space-y-3.5 px-5" aria-label="Loading profile details">
          {["w-16", "w-20", "w-12", "w-24", "w-14"].map((width, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-4"
            >
              <span className="h-3 w-24 animate-pulse rounded-full bg-white/10" />
              <span
                className={`h-3 ${width} animate-pulse rounded-full bg-white/10`}
              />
            </div>
          ))}
        </dl>
      ) : (
        <>
          <dl className="space-y-3 px-5 text-sm">
            {data.rows.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-4"
              >
                <dt className="shrink-0 text-white/55">{row.label}</dt>
                <dd className="text-right font-semibold tabular-nums text-white">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          {data.bio ? (
            <>
              <div className="mx-5 my-5 h-px bg-white/10" />
              <p className="line-clamp-4 px-5 text-sm leading-relaxed text-white/70">
                {data.bio}
              </p>
            </>
          ) : null}
        </>
      )}

      <div className="mt-auto px-5 pb-5 pt-6">
        <Link
          to={profilePath}
          className="flex w-full items-center justify-center rounded-full border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/85 transition-colors hover:border-white/40 hover:text-white"
        >
          View full profile
        </Link>
      </div>
    </aside>
  );
}
