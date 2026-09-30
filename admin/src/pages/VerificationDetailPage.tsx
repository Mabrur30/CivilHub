import { ArrowLeftIcon, ArrowSquareOutIcon, FilePdfIcon } from "@phosphor-icons/react";
import { type ReactElement, type ReactNode, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  DialogActions,
  ErrorNote,
  Loading,
  Modal,
  PageHeader,
  ReasonDialog,
  dangerButton,
  panel,
  primaryButton,
  secondaryButton,
} from "../components/ui";
import { type VerificationDetail, adminApi } from "../lib/api";
import {
  ACTION_LABELS,
  DOCUMENT_LABELS,
  ROLE_LABELS,
  VERIFICATION_STATUS_LABELS,
  formatDate,
  formatDateTime,
} from "../lib/format";

/** Bangladesh trade licences run to the end of the fiscal year, 30 June. */
const nextThirtiethOfJune = (): string => {
  const now = new Date();
  const year = now > new Date(now.getFullYear(), 5, 30) ? now.getFullYear() + 1 : now.getFullYear();
  return `${year}-06-30`;
};

function Fact({ label, value, mismatch }: { label: string; value: ReactNode; mismatch?: boolean }): ReactElement {
  return (
    <div>
      <dt className="text-xs text-white/45">{label}</dt>
      <dd className={`mt-0.5 text-sm ${mismatch ? "font-semibold text-amber-300" : "text-white/85"}`}>{value}</dd>
    </div>
  );
}

function ApproveDialog({
  detail,
  onDone,
  onClose,
}: {
  detail: VerificationDetail;
  onDone: () => void;
  onClose: () => void;
}): ReactElement {
  const isCompany = detail.kind === "organisation";
  const [expiry, setExpiry] = useState<string>(nextThirtiethOfJune());
  const [error, setError] = useState<string>("");
  const [isBusy, setIsBusy] = useState<boolean>(false);

  const submit = async (): Promise<void> => {
    if (isCompany && !expiry) {
      setError("Enter the date the licence expires.");
      return;
    }
    setIsBusy(true);
    setError("");
    try {
      await adminApi(`/verifications/${detail.userId}/approve`, {
        method: "POST",
        body: isCompany ? { licenceExpiresAt: new Date(`${expiry}T23:59:59`).toISOString() } : {},
      });
      onDone();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      setIsBusy(false);
    }
  };

  return (
    <Modal
      title={`Verify ${detail.name}?`}
      description={
        isCompany
          ? "The Verified badge shows on their profile, in search and on their bids until the licence expires. They're reminded 30 days before."
          : "The Verified badge shows on their profile, in search and on their bids. It's removed if they change their name."
      }
      isBusy={isBusy}
      onClose={onClose}
    >
      {isCompany ? (
        <label className="mt-5 grid gap-1.5 text-sm font-semibold text-white/80">
          Licence valid until
          <input
            type="date"
            value={expiry}
            onChange={(event) => {
              setExpiry(event.target.value);
              setError("");
            }}
            className="form-input w-48"
          />
          <span className="text-xs font-normal text-white/50">As printed on the licence; usually 30 June.</span>
        </label>
      ) : null}
      <div className="mt-3">
        <ErrorNote message={error} />
      </div>
      <DialogActions isBusy={isBusy} confirmLabel="Verify" onCancel={onClose} onConfirm={() => void submit()} />
    </Modal>
  );
}

/** One request: what they sent, how it compares with their account now, and the decision. */
export function VerificationDetailPage(): ReactElement {
  const { userId } = useParams<{ userId: string }>();
  const [detail, setDetail] = useState<VerificationDetail | null>(null);
  const [error, setError] = useState<string>("");
  const [dialog, setDialog] = useState<"approve" | "reject" | "revoke" | null>(null);

  const load = useCallback((): void => {
    adminApi<VerificationDetail>(`/verifications/${userId ?? ""}`)
      .then(setDetail)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Couldn't load this request."));
  }, [userId]);

  useEffect(load, [load]);

  const done = (): void => {
    setDialog(null);
    load();
  };

  const nameChanged = detail ? detail.name !== detail.nameAtSubmission : false;
  const licenceMismatch =
    detail?.kind === "organisation" && (detail.profile.tradeLicenceNo ?? "") !== (detail.tradeLicenceNo ?? "");

  return (
    <>
      <Link to="/verifications" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white/60 hover:text-white">
        <ArrowLeftIcon aria-hidden="true" className="h-4 w-4" /> Verification
      </Link>
      <ErrorNote message={error} />
      {!detail && !error ? <Loading /> : null}
      {detail ? (
        <>
          <PageHeader
            title={detail.name}
            intro={`${ROLE_LABELS[detail.role as keyof typeof ROLE_LABELS] ?? detail.role} · ${detail.email} · ${VERIFICATION_STATUS_LABELS[detail.status]}`}
            action={
              detail.status === "pending" ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={secondaryButton} onClick={() => setDialog("reject")}>
                    Reject
                  </button>
                  <button type="button" className={primaryButton} onClick={() => setDialog("approve")}>
                    Verify
                  </button>
                </div>
              ) : detail.status === "verified" ? (
                <button type="button" className={dangerButton} onClick={() => setDialog("revoke")}>
                  Revoke badge
                </button>
              ) : undefined
            }
          />

          {detail.note ? (
            <p className="mb-6 rounded-2xl border border-amber-300/30 bg-amber-300/5 p-4 text-sm text-white/80">
              {detail.status === "pending" ? "Sent back for review: " : "Note: "}
              {detail.note}
            </p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className={`${panel} p-5`} aria-labelledby="submitted-heading">
              <h2 id="submitted-heading" className="font-heading text-lg font-bold text-white">
                What they sent
              </h2>
              <p className="mt-0.5 text-xs text-white/45">{formatDateTime(detail.submittedAt)}</p>
              <dl className="mt-4 grid grid-cols-2 gap-4">
                <Fact label="Name" value={detail.nameAtSubmission} />
                {detail.kind === "engineer" ? (
                  <Fact label="IEB membership number" value={<span className="font-mono">{detail.iebNumber}</span>} />
                ) : (
                  <Fact label="Trade licence number" value={<span className="font-mono">{detail.tradeLicenceNo}</span>} />
                )}
              </dl>
              {detail.kind === "engineer" ? (
                <p className="mt-4 text-xs text-white/55">
                  Check the number and name against the certificate and IEB’s member records, then match the NID
                  photo and name.
                </p>
              ) : (
                <p className="mt-4 text-xs text-white/55">
                  Check the licence number, business name and expiry on the licence, and that the NID holder is named on it.
                </p>
              )}
            </section>

            <section className={`${panel} p-5`} aria-labelledby="account-heading">
              <h2 id="account-heading" className="font-heading text-lg font-bold text-white">
                The account now
              </h2>
              <p className="mt-0.5 text-xs text-white/45">
                <Link to={`/users/${detail.userId}`} className="font-semibold text-primary hover:text-glow">
                  Open account
                </Link>
                {detail.joinedAt ? ` · joined ${formatDate(detail.joinedAt)}` : ""}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-4">
                <Fact label="Name" value={detail.name} mismatch={nameChanged} />
                {detail.kind === "organisation" ? (
                  <Fact label="Licence number on profile" value={detail.profile.tradeLicenceNo ?? "None"} mismatch={licenceMismatch} />
                ) : (
                  <Fact label="Certificates on profile" value={detail.profile.certificateCount ?? 0} />
                )}
                <Fact label="Location" value={detail.profile.location ?? "Not set"} />
                <Fact
                  label="Badge"
                  value={
                    detail.verifiedAt
                      ? `Since ${formatDate(detail.verifiedAt)}${detail.licenceExpiresAt ? `, until ${formatDate(detail.licenceExpiresAt)}` : ""}`
                      : "None"
                  }
                />
              </dl>
              {detail.accountStatus !== "active" ? (
                <p className="mt-4 text-sm font-semibold text-rose-300">This account is {detail.accountStatus}.</p>
              ) : null}
            </section>
          </div>

          <section className="mt-6" aria-labelledby="documents-heading">
            <h2 id="documents-heading" className="mb-3 font-heading text-lg font-bold text-white">
              Documents
            </h2>
            <p className="mb-3 text-xs text-white/45">Links work for 10 minutes. Reload the page for new ones.</p>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {detail.documents.map((doc, index) => (
                <li key={`${doc.kind}-${index}`} className={`${panel} overflow-hidden`}>
                  {doc.isImage ? (
                    <a href={doc.url} target="_blank" rel="noreferrer" className="block bg-black/30">
                      <img src={doc.url} alt={`${DOCUMENT_LABELS[doc.kind]}: ${doc.name}`} className="h-56 w-full object-contain" />
                    </a>
                  ) : (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-56 flex-col items-center justify-center gap-2 bg-black/30 text-white/70 hover:text-white"
                    >
                      <FilePdfIcon aria-hidden="true" className="h-10 w-10" />
                      <span className="inline-flex items-center gap-1 text-sm font-semibold">
                        Open PDF <ArrowSquareOutIcon aria-hidden="true" className="h-4 w-4" />
                      </span>
                    </a>
                  )}
                  <p className="p-3 text-sm">
                    <span className="font-semibold text-white">{DOCUMENT_LABELS[doc.kind]}</span>
                    <span className="block truncate text-xs text-white/50">{doc.name}</span>
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {detail.history.length > 0 ? (
            <section className="mt-6" aria-labelledby="history-heading">
              <h2 id="history-heading" className="mb-3 font-heading text-lg font-bold text-white">
                History
              </h2>
              <ul className={`${panel} divide-y divide-white/5`}>
                {detail.history.map((entry) => (
                  <li key={`${entry.action}-${entry.at}`} className="p-4 text-sm">
                    <span className="font-semibold text-white">{ACTION_LABELS[entry.action] ?? entry.action}</span>
                    <span className="text-white/50"> · {entry.admin} · {formatDateTime(entry.at)}</span>
                    {entry.reason ? <span className="mt-1 block text-white/65">{entry.reason}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {dialog === "approve" ? <ApproveDialog detail={detail} onDone={done} onClose={() => setDialog(null)} /> : null}
          {dialog === "reject" || dialog === "revoke" ? (
            <ReasonDialog
              title={dialog === "reject" ? `Reject ${detail.name}'s request?` : `Revoke ${detail.name}'s badge?`}
              description="They'll see your reason, and can send their details again from Settings."
              confirmLabel={dialog === "reject" ? "Reject" : "Revoke badge"}
              danger
              onConfirm={async ({ reason }) => {
                await adminApi(`/verifications/${detail.userId}/${dialog}`, { method: "POST", body: { reason } });
                done();
              }}
              onClose={() => setDialog(null)}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
