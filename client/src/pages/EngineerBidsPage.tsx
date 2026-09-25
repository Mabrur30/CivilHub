import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { type FormEvent, type ReactElement, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatRelativeTime } from "../components/dashboard/notificationUtils";
import {
  inlineLinkClassName,
  inputClassName,
  panelClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "../components/dashboard/ui/buttonStyles";
import { FilterTabs } from "../components/dashboard/ui/FilterTabs";
import { PageHeader } from "../components/dashboard/ui/PageHeader";
import { EmptyPanel, ErrorPanel } from "../components/dashboard/ui/StatePanels";
import { countOf, formatCurrency, formatDate } from "../lib/format";
import { MoneyInput } from "../components/dashboard/ui/MoneyInput";
import { moneyValue } from "../lib/money";

interface EngineerBid {
  id: string;
  projectId: string;
  clientUserId: string;
  projectTitle: string;
  clientName: string;
  amount: number;
  status: "pending" | "accepted" | "declined";
  submittedDate: string;
  projectStatus: string;
}

interface BidInvitation {
  id: string;
  projectId: string;
  projectTitle: string;
  projectStatus: string;
  client: {
    id: string;
    name: string;
  };
  status: "pending";
  createdAt: string;
}

interface ErrorResponse {
  message?: string;
}

type BidFilter = "all" | EngineerBid["status"];

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const MARKETPLACE_ROUTE = "/dashboard/engineer/marketplace";

const isEngineerBid = (value: unknown): value is EngineerBid => {
  if (typeof value !== "object" || value === null) return false;
  const bid = value as Record<string, unknown>;
  return (
    typeof bid.id === "string" &&
    typeof bid.projectId === "string" &&
    typeof bid.clientUserId === "string" &&
    typeof bid.projectTitle === "string" &&
    typeof bid.clientName === "string" &&
    typeof bid.amount === "number" &&
    (bid.status === "pending" ||
      bid.status === "accepted" ||
      bid.status === "declined") &&
    typeof bid.submittedDate === "string" &&
    typeof bid.projectStatus === "string"
  );
};

const isBidInvitation = (value: unknown): value is BidInvitation => {
  if (typeof value !== "object" || value === null) return false;
  const invitation = value as Record<string, unknown>;
  const client = invitation.client as Record<string, unknown> | undefined;
  return (
    typeof invitation.id === "string" &&
    typeof invitation.projectId === "string" &&
    typeof invitation.projectTitle === "string" &&
    typeof invitation.projectStatus === "string" &&
    invitation.status === "pending" &&
    typeof invitation.createdAt === "string" &&
    typeof client?.id === "string" &&
    typeof client?.name === "string"
  );
};

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const body = value as ErrorResponse;
    if (typeof body.message === "string") return body.message;
  }
  return "Unable to load your bids.";
};

const statusStyles: Record<EngineerBid["status"], string> = {
  pending: "bg-white/10 text-white/80",
  accepted: "bg-emerald-400/10 text-emerald-300",
  declined: "bg-white/5 text-white/40",
};

const statusLabels: Record<EngineerBid["status"], string> = {
  pending: "Awaiting review",
  accepted: "Accepted",
  declined: "Declined",
};

const filterTabs: { key: BidFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Awaiting review" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
];

const emptyFilterMessages: Record<BidFilter, string> = {
  all: "You haven't placed any bids yet.",
  pending: "No bids are waiting on a client right now.",
  accepted: "None of your bids have been accepted yet.",
  declined: "None of your bids have been declined.",
};

const formatProjectStatus = (status: string): string =>
  status.replaceAll("_", " ").replaceAll("-", " ");

const getSummary = (
  bids: EngineerBid[],
  invitations: BidInvitation[],
): string => {
  if (bids.length === 0 && invitations.length === 0) {
    return "Bids you send and invitations from clients show up here.";
  }

  const pending = bids.filter((bid) => bid.status === "pending").length;
  const accepted = bids.filter((bid) => bid.status === "accepted").length;
  const sentences: string[] = [];
  if (invitations.length > 0) {
    sentences.push(
      `${countOf(invitations.length, "invitation needs", "invitations need")} a reply.`,
    );
  }
  if (pending > 0) {
    sentences.push(`${countOf(pending, "bid", "bids")} awaiting client review.`);
  }
  if (accepted > 0) {
    sentences.push(`${countOf(accepted, "bid", "bids")} accepted.`);
  }
  return sentences.length
    ? sentences.join(" ")
    : `${countOf(bids.length, "bid", "bids")} placed, none awaiting review.`;
};

function BidListSkeleton(): ReactElement {
  return (
    <section className={panelClassName} aria-label="Loading bids">
      <div className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
        <div className="h-7 w-24 animate-pulse rounded bg-white/10" />
      </div>
      <ul className="divide-y divide-white/10 border-t border-white/10">
        {[1, 2, 3].map((item) => (
          <li
            key={item}
            className="grid animate-pulse gap-4 px-5 py-5 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-6"
          >
            <div className="lg:col-span-5">
              <div className="h-5 w-2/3 rounded bg-white/10" />
              <div className="mt-2 h-3.5 w-1/2 rounded bg-white/10" />
            </div>
            <div className="h-6 w-24 rounded bg-white/10 lg:col-span-2" />
            <div className="h-3.5 w-20 rounded bg-white/10 lg:col-span-2" />
            <div className="h-6 w-28 rounded-full bg-white/10 lg:col-span-3 lg:ml-auto" />
          </li>
        ))}
      </ul>
    </section>
  );
}

interface InvitationRowProps {
  invitation: BidInvitation;
  isAccepting: boolean;
  isBusy: boolean;
  error: string;
  onStartAccept: () => void;
  onCancelAccept: () => void;
  onAccept: (amount: string, message: string) => void;
  onDecline: () => void;
}

function InvitationRow({
  invitation,
  isAccepting,
  isBusy,
  error,
  onStartAccept,
  onCancelAccept,
  onAccept,
  onDecline,
}: InvitationRowProps): ReactElement {
  const [amount, setAmount] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const amountId = `invitation-amount-${invitation.id}`;
  const messageId = `invitation-message-${invitation.id}`;
  const errorId = `invitation-error-${invitation.id}`;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onAccept(amount, message);
  };

  return (
    <li className="px-5 py-5 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-heading text-xl font-bold text-white">
            {invitation.projectTitle}
          </p>
          <p className="mt-1 text-sm text-white/50">
            Invited by{" "}
            <Link
              to={`/users/${invitation.client.id}`}
              className={inlineLinkClassName}
            >
              {invitation.client.name}
            </Link>{" "}
            <span title={formatDate(invitation.createdAt)}>
              {formatRelativeTime(invitation.createdAt).toLowerCase()}
            </span>
          </p>
        </div>
        {isAccepting ? null : (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onDecline}
              disabled={isBusy}
              className={secondaryButtonClassName}
            >
              {isBusy ? "Declining..." : "Decline"}
            </button>
            <button
              type="button"
              onClick={onStartAccept}
              disabled={isBusy}
              className={primaryButtonClassName}
            >
              Accept
            </button>
          </div>
        )}
      </div>

      {isAccepting ? (
        <form
          onSubmit={handleSubmit}
          className="mt-5 grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]"
          aria-label={`Bid on ${invitation.projectTitle}`}
        >
          <div className="grid content-start gap-2">
            <label
              htmlFor={amountId}
              className="text-sm font-semibold text-white/80"
            >
              Your price
            </label>
            <MoneyInput
              id={amountId}
              value={amount}
              onChange={setAmount}
              describedBy={error ? errorId : undefined}
              autoFocus
            />
          </div>
          <div className="grid content-start gap-2">
            <label
              htmlFor={messageId}
              className="text-sm font-semibold text-white/80"
            >
              Message to {invitation.client.name}
            </label>
            <textarea
              id={messageId}
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              aria-describedby={error ? errorId : undefined}
              className={`${inputClassName} resize-none`}
            />
            <p className="text-xs text-white/45">
              Your scope, timeline and anything the client should know.
            </p>
          </div>
          {error ? (
            <p
              id={errorId}
              className="text-sm text-rose-300 sm:col-span-2"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={isBusy}
              className={primaryButtonClassName}
            >
              {isBusy ? "Submitting..." : "Submit bid"}
            </button>
            <button
              type="button"
              onClick={onCancelAccept}
              disabled={isBusy}
              className={secondaryButtonClassName}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : error ? (
        <p className="mt-3 text-sm text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function BidRow({ bid }: { bid: EngineerBid }): ReactElement {
  const isAccepted = bid.status === "accepted";
  const projectPath = `/dashboard/engineer/projects/${bid.projectId}`;

  return (
    <li className="grid grid-cols-2 items-center gap-3 px-5 py-5 sm:px-6 lg:grid-cols-12 lg:gap-6">
      <div className="col-span-2 min-w-0 lg:col-span-5">
        {isAccepted ? (
          <Link
            to={projectPath}
            className="rounded font-heading text-xl font-bold text-white transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow"
          >
            {bid.projectTitle}
          </Link>
        ) : (
          <p
            className={`font-heading text-xl font-bold ${
              bid.status === "declined" ? "text-white/55" : "text-white"
            }`}
          >
            {bid.projectTitle}
          </p>
        )}
        <p className="mt-1 text-sm text-white/50">
          For{" "}
          <Link to={`/users/${bid.clientUserId}`} className={inlineLinkClassName}>
            {bid.clientName}
          </Link>
          , project {formatProjectStatus(bid.projectStatus)}
        </p>
      </div>

      <p
        className={`font-heading text-xl font-bold tabular-nums lg:col-span-2 ${
          bid.status === "declined" ? "text-white/45" : "text-white"
        }`}
      >
        {formatCurrency(bid.amount)}
      </p>

      <p className="text-right text-sm text-white/55 lg:col-span-2 lg:text-left">
        {formatDate(bid.submittedDate)}
      </p>

      <div className="col-span-2 flex flex-wrap items-center gap-3 lg:col-span-3 lg:justify-end">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[bid.status]}`}
        >
          {statusLabels[bid.status]}
        </span>
        {isAccepted ? (
          <Link
            to={projectPath}
            className="rounded-full text-sm font-semibold text-primary transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow"
          >
            Open project
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export function EngineerBidsPage(): ReactElement {
  const [bids, setBids] = useState<EngineerBid[]>([]);
  const [invitations, setInvitations] = useState<BidInvitation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [retryKey, setRetryKey] = useState<number>(0);
  const [filter, setFilter] = useState<BidFilter>("all");
  const [activeInvitationId, setActiveInvitationId] = useState<string | null>(
    null,
  );
  const [acceptingInvitationId, setAcceptingInvitationId] = useState<
    string | null
  >(null);
  // Errors are pinned to the invitation they came from, so the message shows
  // up on the row the engineer was working on instead of below the whole list.
  const [invitationError, setInvitationError] = useState<{
    id: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    const loadBids = async (): Promise<void> => {
      setIsLoading(true);
      setError("");
      try {
        const [bidsResponse, invitationsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/bids/my-bids`, {
            credentials: "include",
          }),
          fetch(`${API_BASE_URL}/api/bid-invitations/engineer/pending`, {
            credentials: "include",
          }),
        ]);

        const [bidsBody, invitationsBody]: [unknown, unknown] =
          await Promise.all([bidsResponse.json(), invitationsResponse.json()]);

        if (
          !bidsResponse.ok ||
          !Array.isArray(bidsBody) ||
          !bidsBody.every(isEngineerBid)
        ) {
          setError(getErrorMessage(bidsBody));
          return;
        }

        if (
          !invitationsResponse.ok ||
          !Array.isArray(invitationsBody) ||
          !invitationsBody.every(isBidInvitation)
        ) {
          setError(getErrorMessage(invitationsBody));
          return;
        }

        setBids(bidsBody);
        setInvitations(invitationsBody);
      } catch {
        setError("Unable to connect to CivilHub. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };
    void loadBids();
  }, [retryKey]);

  const declineInvitation = async (invitationId: string): Promise<void> => {
    setActiveInvitationId(invitationId);
    setInvitationError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/bid-invitations/${invitationId}/decline`,
        {
          method: "PATCH",
          credentials: "include",
        },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        setInvitationError({
          id: invitationId,
          message: getErrorMessage(body),
        });
        return;
      }
      setRetryKey((current) => current + 1);
    } catch {
      setInvitationError({
        id: invitationId,
        message: "Unable to connect to CivilHub. Please try again.",
      });
    } finally {
      setActiveInvitationId(null);
    }
  };

  const acceptInvitation = async (
    invitationId: string,
    amount: string,
    message: string,
  ): Promise<void> => {
    const amountValue = moneyValue(amount) ?? Number.NaN;
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setInvitationError({
        id: invitationId,
        message: "Enter a price greater than zero.",
      });
      return;
    }
    if (!message.trim()) {
      setInvitationError({
        id: invitationId,
        message: "Add a short message for the client.",
      });
      return;
    }

    setActiveInvitationId(invitationId);
    setInvitationError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/bid-invitations/${invitationId}/accept`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amountValue,
            message: message.trim(),
          }),
        },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        setInvitationError({
          id: invitationId,
          message: getErrorMessage(body),
        });
        return;
      }
      setAcceptingInvitationId(null);
      setRetryKey((current) => current + 1);
    } catch {
      setInvitationError({
        id: invitationId,
        message: "Unable to connect to CivilHub. Please try again.",
      });
    } finally {
      setActiveInvitationId(null);
    }
  };

  const countFor = (key: BidFilter): number =>
    key === "all"
      ? bids.length
      : bids.filter((bid) => bid.status === key).length;
  const filteredBids =
    filter === "all" ? bids : bids.filter((bid) => bid.status === filter);

  return (
    <div className="space-y-8">
      <PageHeader
        title="My bids"
        summary={
          isLoading
            ? "Every proposal you've sent, and where each one stands."
            : getSummary(bids, invitations)
        }
        action={
          <Link to={MARKETPLACE_ROUTE} className={primaryButtonClassName}>
            <MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />
            Find projects
          </Link>
        }
      />

      {isLoading ? (
        <BidListSkeleton />
      ) : error ? (
        <ErrorPanel
          message={error}
          onRetry={() => setRetryKey((key) => key + 1)}
        />
      ) : bids.length === 0 && invitations.length === 0 ? (
        <EmptyPanel
          title="No bids or invitations yet"
          body="Open briefs are listed in the marketplace. Send a bid on one and you can track it here."
        />
      ) : (
        <>
          {invitations.length > 0 ? (
            <section
              className={panelClassName}
              aria-labelledby="invitations-heading"
            >
              <div className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
                <h2
                  id="invitations-heading"
                  className="font-heading text-2xl font-bold text-white"
                >
                  Invitations
                </h2>
                <p className="mt-1 text-sm text-white/50">
                  Clients asked you to bid. Accepting sends a bid with your own
                  price and message.
                </p>
              </div>
              <ul className="divide-y divide-white/10 border-t border-white/10">
                {invitations.map((invitation) => (
                  <InvitationRow
                    key={invitation.id}
                    invitation={invitation}
                    isAccepting={acceptingInvitationId === invitation.id}
                    isBusy={activeInvitationId === invitation.id}
                    error={
                      invitationError?.id === invitation.id
                        ? invitationError.message
                        : ""
                    }
                    onStartAccept={() => {
                      setAcceptingInvitationId(invitation.id);
                      setInvitationError(null);
                    }}
                    onCancelAccept={() => {
                      setAcceptingInvitationId(null);
                      setInvitationError(null);
                    }}
                    onAccept={(amount, message) =>
                      void acceptInvitation(invitation.id, amount, message)
                    }
                    onDecline={() => void declineInvitation(invitation.id)}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {bids.length > 0 ? (
            <section className={panelClassName} aria-labelledby="bids-heading">
              <div className="flex flex-col gap-4 px-5 pb-4 pt-5 sm:px-6 sm:pt-6 lg:flex-row lg:items-center lg:justify-between">
                <h2
                  id="bids-heading"
                  className="font-heading text-2xl font-bold text-white"
                >
                  Bids
                </h2>
                <FilterTabs
                  options={filterTabs.map((tab) => ({
                    ...tab,
                    count: countFor(tab.key),
                  }))}
                  value={filter}
                  onChange={setFilter}
                  label="Filter bids by status"
                />
              </div>
              <div
                className="hidden border-t border-white/10 px-6 py-2.5 text-xs font-semibold text-white/40 lg:grid lg:grid-cols-12 lg:gap-6"
                aria-hidden="true"
              >
                <span className="col-span-5">Project</span>
                <span className="col-span-2">Your bid</span>
                <span className="col-span-2">Submitted</span>
                <span className="col-span-3 text-right">Status</span>
              </div>
              {filteredBids.length > 0 ? (
                <ul className="divide-y divide-white/10 border-t border-white/10">
                  {filteredBids.map((bid) => (
                    <BidRow key={bid.id} bid={bid} />
                  ))}
                </ul>
              ) : (
                <p className="border-t border-white/10 px-5 py-8 text-sm text-white/50 sm:px-6">
                  {emptyFilterMessages[filter]}
                </p>
              )}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
