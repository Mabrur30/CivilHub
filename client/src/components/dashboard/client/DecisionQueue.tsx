import {
  CheckCircleIcon,
  ClipboardTextIcon,
  HandshakeIcon,
  type Icon,
  SealCheckIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { Link } from "react-router-dom";
import { formatCurrency } from "../../../lib/format";
import { panelClassName, outlineButtonClassName } from "../ui/buttonStyles";
import {
  type ClientActionItem,
  type ClientActionKind,
  formatWaiting,
} from "./clientData";

interface ActionCopy {
  icon: Icon;
  title: (item: ClientActionItem) => string;
  action: string;
}

const actionCopy: Record<ClientActionKind, ActionCopy> = {
  bids_review: {
    icon: HandshakeIcon,
    title: (item) =>
      item.count === 1 ? "Choose from 1 bid" : `Compare ${item.count ?? 0} bids`,
    action: "Compare bids",
  },
  plan_review: {
    icon: ClipboardTextIcon,
    title: () => "Review the phase plan",
    action: "Review plan",
  },
  advance_due: {
    icon: WalletIcon,
    title: () => "Pay the advance so work can start",
    action: "Pay advance",
  },
  phase_review: {
    icon: CheckCircleIcon,
    title: (item) => `Approve ${item.phaseName ?? "the finished phase"}`,
    action: "Review phase",
  },
  phase_payment: {
    icon: WalletIcon,
    title: (item) => `Pay for ${item.phaseName ?? "a finished phase"}`,
    action: "Pay now",
  },
};

function QueueRow({ item }: { item: ClientActionItem }): ReactElement {
  const copy = actionCopy[item.kind];
  const Glyph = copy.icon;

  return (
    <li className="grid gap-4 px-5 py-5 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-5 sm:px-6">
      <span className="hidden h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary sm:flex">
        <Glyph className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-white">{copy.title(item)}</p>
        <p className="mt-1 truncate text-sm text-white/55">
          {item.projectTitle}{" "}
          <span className="text-white/40">
            · waiting {formatWaiting(item.since)}
          </span>
        </p>
      </div>
      {item.amount !== null ? (
        <p className="text-lg font-semibold tabular-nums text-white sm:text-right">
          {formatCurrency(item.amount)}
        </p>
      ) : (
        <span className="hidden sm:block" />
      )}
      <Link to={item.href} className={outlineButtonClassName}>
        {copy.action}
      </Link>
    </li>
  );
}

interface DecisionQueueProps {
  items: ClientActionItem[];
  isLoading: boolean;
}

// The first thing a client sees: every plan, payment and bid decision that is
// holding a project up, oldest first, each with the one action that clears it.
export function DecisionQueue({
  items,
  isLoading,
}: DecisionQueueProps): ReactElement {
  return (
    <section
      aria-labelledby="decision-queue-heading"
      className={`${panelClassName} border-t-2 border-t-primary`}
    >
      <div className="flex items-baseline justify-between gap-4 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
        <h2
          id="decision-queue-heading"
          className="font-heading text-2xl font-bold text-white sm:text-3xl"
        >
          Waiting on you
        </h2>
        {!isLoading && items.length > 0 ? (
          <p className="text-sm text-white/50">
            {items.length === 1 ? "1 decision" : `${items.length} decisions`}
          </p>
        ) : null}
      </div>

      {isLoading ? (
        <ul className="divide-y divide-white/10 border-t border-white/10" aria-label="Loading decisions">
          {[0, 1].map((row) => (
            <li key={row} className="flex animate-pulse items-center gap-5 px-6 py-5">
              <span className="h-10 w-10 rounded-full bg-white/10" />
              <span className="flex-1">
                <span className="block h-4 w-1/2 rounded bg-white/10" />
                <span className="mt-2 block h-3 w-1/3 rounded bg-white/10" />
              </span>
              <span className="h-10 w-28 rounded-full bg-white/10" />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="flex items-start gap-4 border-t border-white/10 px-5 py-8 sm:px-6">
          <SealCheckIcon
            className="mt-0.5 h-6 w-6 shrink-0 text-emerald-300"
            aria-hidden="true"
          />
          <div>
            <p className="font-semibold text-white">Nothing needs you right now</p>
            <p className="mt-1 max-w-[60ch] text-sm leading-6 text-white/55">
              Bids to compare, plans to review and phases to approve show up
              here the moment they need your decision.
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-white/10 border-t border-white/10">
          {items.map((item) => (
            <QueueRow
              key={`${item.kind}-${item.projectId}-${item.phaseId ?? ""}`}
              item={item}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
