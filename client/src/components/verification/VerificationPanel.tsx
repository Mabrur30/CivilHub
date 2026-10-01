import { SealCheckIcon } from "@phosphor-icons/react";
import { type FormEvent, type ReactElement, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { inputClassName, panelClassName, primaryButtonClassName } from "../dashboard/ui/buttonStyles";
import { FormField } from "../dashboard/ui/FormField";
import { VerifiedBadge } from "../VerifiedBadge";
import { API_BASE_URL } from "../../lib/apiBase";

const FILE_TYPES = "image/jpeg,image/png,image/webp,application/pdf";
const MAX_BYTES = 10 * 1024 * 1024;

type Status = "pending" | "verified" | "rejected" | "lapsed";

interface MyVerification {
  kind: "engineer" | "organisation";
  verifiedAt: string | null;
  profileTradeLicenceNo: string | null;
  verification: {
    status: Status;
    iebNumber: string | null;
    tradeLicenceNo: string | null;
    submittedAt: string;
    reviewedAt: string | null;
    note: string | null;
    licenceExpiresAt: string | null;
    documents: Array<{ kind: string; name: string; uploadedAt: string }>;
  } | null;
}

const isMyVerification = (value: unknown): value is MyVerification =>
  typeof value === "object" &&
  value !== null &&
  ((value as MyVerification).kind === "engineer" || (value as MyVerification).kind === "organisation");

const formatDay = (value: string): string =>
  new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function FileField({
  id,
  label,
  hint,
  multiple = false,
  files,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  multiple?: boolean;
  files: File[];
  onChange: (files: File[]) => void;
}): ReactElement {
  return (
    <FormField id={id} label={label} hint={hint}>
      <input
        id={id}
        type="file"
        accept={FILE_TYPES}
        multiple={multiple}
        onChange={(event) => onChange(Array.from(event.target.files ?? []).slice(0, multiple ? 2 : 1))}
        className="block w-full text-sm text-white/70 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/15"
      />
      {files.length > 0 ? (
        <p className="mt-1 text-xs text-white/50">{files.map((file) => file.name).join(", ")}</p>
      ) : null}
    </FormField>
  );
}

/**
 * Where an engineer or company asks CivilHub to verify them, and sees how
 * it's going. Engineers send their IEB membership and NID; companies their
 * trade licence and the account holder's NID. Only the CivilHub team sees
 * the files.
 */
export function VerificationPanel(): ReactElement {
  const location = useLocation();
  const sectionRef = useRef<HTMLElement>(null);
  const [data, setData] = useState<MyVerification | null>(null);
  const [loadError, setLoadError] = useState<string>("");
  const [iebNumber, setIebNumber] = useState<string>("");
  const [licenceNo, setLicenceNo] = useState<string>("");
  const [mainFile, setMainFile] = useState<File[]>([]);
  const [nidFiles, setNidFiles] = useState<File[]>([]);
  const [formError, setFormError] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);

  useEffect(() => {
    let isActive = true;
    fetch(`${API_BASE_URL}/api/verification/me`, { credentials: "include" })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!isActive) return;
        if (!response.ok || !isMyVerification(body)) {
          setLoadError("Couldn't load your verification. Please refresh.");
          return;
        }
        setData(body);
        setLicenceNo(body.verification?.tradeLicenceNo ?? body.profileTradeLicenceNo ?? "");
        setIebNumber(body.verification?.iebNumber ?? "");
      })
      .catch(() => {
        if (isActive) setLoadError("Unable to connect to CivilHub. Please try again.");
      });
    return () => {
      isActive = false;
    };
  }, []);

  // Profiles link here with #verification.
  useEffect(() => {
    if (data && location.hash === "#verification") {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [data, location.hash]);

  const isCompany = data?.kind === "organisation";
  const status = data?.verification?.status ?? null;
  const canSubmit = data !== null && (status === null || status === "rejected" || status === "lapsed");

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (isCompany ? licenceNo.trim().length < 3 : !iebNumber.trim()) {
      setFormError(isCompany ? "Enter your trade licence number." : "Enter your IEB membership number.");
      return;
    }
    if (mainFile.length === 0) {
      setFormError(isCompany ? "Add your trade licence." : "Add your IEB membership certificate.");
      return;
    }
    if (nidFiles.length === 0) {
      setFormError("Add your national ID card (NID).");
      return;
    }
    if ([...mainFile, ...nidFiles].some((file) => file.size > MAX_BYTES)) {
      setFormError("Each file must be 10 MB or smaller.");
      return;
    }

    const form = new FormData();
    if (isCompany) {
      form.append("tradeLicenceNo", licenceNo.trim());
      form.append("licence", mainFile[0]);
    } else {
      form.append("iebNumber", iebNumber.trim());
      form.append("ieb", mainFile[0]);
    }
    nidFiles.forEach((file) => form.append("nid", file));

    setIsSending(true);
    setFormError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/verification/me`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const body = (await response.json().catch(() => null)) as
        | { verification?: MyVerification["verification"]; message?: string }
        | null;
      if (!response.ok || !body?.verification) {
        setFormError(body?.message ?? "That didn't send. Please try again.");
        return;
      }
      setData((current) => (current ? { ...current, verification: body.verification ?? null } : current));
      setMainFile([]);
      setNidFiles([]);
    } catch {
      setFormError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const verification = data?.verification;

  return (
    <section
      ref={sectionRef}
      id="verification"
      className={`${panelClassName} scroll-mt-24 p-6 sm:p-8`}
      aria-labelledby="settings-verification"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="settings-verification" className="font-heading text-2xl font-bold text-white">
          Verification
        </h2>
        {data?.verifiedAt ? <VerifiedBadge /> : null}
      </div>
      <p className="mt-1 max-w-[65ch] text-sm text-white/55">
        {isCompany
          ? "CivilHub checks your trade licence and the ID of the person who runs this account. Verified companies get a badge on their profile, in search and on their bids, and are shown first in search."
          : "CivilHub checks your IEB membership and your national ID. Verified engineers get a badge on their profile, in search and on their bids, and are shown first in search."}
      </p>

      {loadError ? (
        <p role="alert" className="mt-4 text-sm text-rose-300">
          {loadError}
        </p>
      ) : null}

      {verification ? (
        <div
          className={`mt-5 rounded-xl border p-4 text-sm sm:max-w-xl ${
            verification.status === "verified"
              ? "border-emerald-300/30 bg-emerald-300/5"
              : verification.status === "pending"
                ? "border-white/10 bg-void/40"
                : "border-amber-300/30 bg-amber-300/5"
          }`}
          role="status"
        >
          <p className="flex items-center gap-2 font-semibold text-white">
            <SealCheckIcon className="h-4 w-4 text-primary" aria-hidden="true" />
            {verification.status === "verified"
              ? `Verified since ${formatDay(data?.verifiedAt ?? verification.reviewedAt ?? verification.submittedAt)}`
              : verification.status === "pending"
                ? "With CivilHub for review"
                : verification.status === "rejected"
                  ? "Not verified"
                  : "Your badge has lapsed"}
          </p>
          <p className="mt-1 text-white/70">
            {verification.status === "pending"
              ? `Sent ${formatDay(verification.submittedAt)}. CivilHub will let you know once it's checked.`
              : verification.status === "verified" && verification.licenceExpiresAt
                ? `Until your trade licence expires on ${formatDay(verification.licenceExpiresAt)}. Upload the renewed one then to keep the badge.`
                : verification.status === "verified"
                  ? "If you change your name, CivilHub checks your details again."
                  : (verification.note ?? "Send your details again below.")}
          </p>
          {verification.status === "pending" && verification.note ? (
            <p className="mt-1 text-white/55">{verification.note}.</p>
          ) : null}
          <p className="mt-2 text-xs text-white/45">
            {verification.iebNumber ? `IEB ${verification.iebNumber} · ` : ""}
            {verification.tradeLicenceNo ? `Licence ${verification.tradeLicenceNo} · ` : ""}
            {verification.documents.map((doc) => doc.name).join(", ")}
          </p>
        </div>
      ) : null}

      {canSubmit ? (
        <form className="mt-6 grid max-w-xl gap-4" noValidate onSubmit={(event) => void submit(event)}>
          {isCompany ? (
            <>
              <FormField
                id="verify-licence-no"
                label="Trade licence number"
                hint="Exactly as it's printed on the licence. It's also shown on your company profile."
              >
                <input
                  id="verify-licence-no"
                  value={licenceNo}
                  onChange={(event) => {
                    setLicenceNo(event.target.value);
                    setFormError("");
                  }}
                  maxLength={60}
                  className={inputClassName}
                />
              </FormField>
              <FileField
                id="verify-licence"
                label="Trade licence"
                hint="A clear photo or PDF of the current licence."
                files={mainFile}
                onChange={setMainFile}
              />
            </>
          ) : (
            <>
              <FormField id="verify-ieb-no" label="IEB membership number" hint="For example M/12345, A/1234 or F/5678.">
                <input
                  id="verify-ieb-no"
                  value={iebNumber}
                  onChange={(event) => {
                    setIebNumber(event.target.value);
                    setFormError("");
                  }}
                  maxLength={20}
                  autoCapitalize="characters"
                  className={inputClassName}
                />
              </FormField>
              <FileField
                id="verify-ieb"
                label="IEB membership certificate"
                hint="A clear photo or PDF of your certificate or membership card."
                files={mainFile}
                onChange={setMainFile}
              />
            </>
          )}
          <FileField
            id="verify-nid"
            label={isCompany ? "NID of the account holder" : "Your national ID card (NID)"}
            hint="Front and back: choose both photos at once. Images or PDF, 10 MB each."
            multiple
            files={nidFiles}
            onChange={setNidFiles}
          />
          <p className="text-xs text-white/45">
            Only the CivilHub team sees these files. They never appear on your profile.
          </p>
          {formError ? (
            <p role="alert" className="text-sm text-rose-300">
              {formError}
            </p>
          ) : null}
          <button type="submit" disabled={isSending} className={`${primaryButtonClassName} w-fit`}>
            {isSending ? "Sending..." : "Send for verification"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
