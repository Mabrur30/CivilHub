import { type FormEvent, type ReactElement, useEffect, useState } from "react";
import {
  inputClassName,
  panelClassName,
  primaryButtonClassName,
} from "../dashboard/ui/buttonStyles";
import { FormField } from "../dashboard/ui/FormField";
import { ChoiceChips } from "../project/ChoiceChips";
import { formatCurrency } from "../../lib/format";
import { API_BASE_URL } from "../../lib/apiBase";

type PayoutMethod = "bkash" | "nagad" | "rocket" | "bank";

interface PayoutAccount {
  method: PayoutMethod;
  accountName: string;
  accountNumber: string;
  bankName: string | null;
  branch: string | null;
  routingNumber: string | null;
}

interface MyPayouts {
  released: number;
  onHold: number;
  paidOut: number;
  owed: number;
  account: PayoutAccount | null;
  payouts: Array<{
    id: string;
    amount: number;
    method: PayoutMethod;
    accountNumber: string;
    reference: string;
    paidAt: string;
  }>;
}

const METHODS: Array<{ value: PayoutMethod; label: string }> = [
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "rocket", label: "Rocket" },
  { value: "bank", label: "Bank account" },
];
const METHOD_LABEL = Object.fromEntries(METHODS.map((method) => [method.value, method.label])) as Record<PayoutMethod, string>;

const EMPTY_FORM = { method: "bkash" as PayoutMethod, accountName: "", accountNumber: "", bankName: "", branch: "", routingNumber: "" };

const isMyPayouts = (value: unknown): value is MyPayouts =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as MyPayouts).owed === "number" &&
  Array.isArray((value as MyPayouts).payouts);

const formatDay = (value: string): string =>
  new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * Where CivilHub should send an engineer's or company's earnings, and what
 * they've earned so far. Payouts are sent by the CivilHub team once the
 * client has accepted the work.
 */
export function GettingPaidPanel(): ReactElement {
  const [data, setData] = useState<MyPayouts | null>(null);
  const [loadError, setLoadError] = useState<string>("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [currentPassword, setCurrentPassword] = useState<string>("");
  const [outcome, setOutcome] = useState<{ kind: "saved" | "error"; message: string } | null>(null);

  useEffect(() => {
    let isActive = true;
    fetch(`${API_BASE_URL}/api/payouts/me`, { credentials: "include" })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!isActive) return;
        if (!response.ok || !isMyPayouts(body)) {
          setLoadError("Couldn't load your earnings. Please refresh.");
          return;
        }
        setData(body);
        setIsEditing(body.account === null);
      })
      .catch(() => {
        if (isActive) setLoadError("Unable to connect to CivilHub. Please try again.");
      });
    return () => {
      isActive = false;
    };
  }, []);

  const startEditing = (): void => {
    const account = data?.account;
    setForm(
      account
        ? {
            method: account.method,
            accountName: account.accountName,
            accountNumber: account.accountNumber,
            bankName: account.bankName ?? "",
            branch: account.branch ?? "",
            routingNumber: account.routingNumber ?? "",
          }
        : EMPTY_FORM,
    );
    setOutcome(null);
    setIsEditing(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setIsSaving(true);
    setOutcome(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/payouts/me/account`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, currentPassword }),
      });
      const body = (await response.json().catch(() => null)) as (PayoutAccount & { message?: string }) | null;
      if (!response.ok || !body) {
        setOutcome({ kind: "error", message: body?.message ?? "That didn't save. Please try again." });
        return;
      }
      setData((current) => (current ? { ...current, account: body } : current));
      setCurrentPassword("");
      setIsEditing(false);
      setOutcome({ kind: "saved", message: "Payout account saved." });
    } catch {
      setOutcome({ kind: "error", message: "Unable to connect to CivilHub. Please try again." });
    } finally {
      setIsSaving(false);
    }
  };

  const set = (field: keyof typeof EMPTY_FORM) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setOutcome(null);
  };

  const isBank = form.method === "bank";

  return (
    <section className={`${panelClassName} p-6 sm:p-8`} aria-labelledby="settings-getting-paid">
      <h2 id="settings-getting-paid" className="font-heading text-2xl font-bold text-white">
        Getting paid
      </h2>
      <p className="mt-1 max-w-[65ch] text-sm text-white/55">
        Your share of each payment is released once the client accepts the work, or when a rental is
        returned. The CivilHub team then sends it to the account below.
      </p>

      {loadError ? (
        <p role="alert" className="mt-4 text-sm text-rose-300">
          {loadError}
        </p>
      ) : null}

      {data ? (
        <>
          <dl className="mt-5 grid grid-cols-3 gap-4 sm:max-w-xl">
            {(
              [
                ["Ready to send", data.owed],
                ["Waiting on approval", data.onHold],
                ["Paid to you", data.paidOut],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-white/50">{label}</dt>
                <dd className="mt-1 font-heading text-2xl font-bold text-white tabular-nums">{formatCurrency(value)}</dd>
              </div>
            ))}
          </dl>

          {isEditing ? (
            <form className="mt-6 grid max-w-xl gap-4" noValidate onSubmit={(event) => void save(event)}>
              <ChoiceChips
                id="payout-method"
                name="payout-method"
                legend="Send my money to"
                options={METHODS}
                value={form.method}
                onChange={(value) => set("method")(value)}
              />
              <FormField id="payout-name" label={isBank ? "Account holder's name" : "Name on the wallet"}>
                <input
                  id="payout-name"
                  value={form.accountName}
                  onChange={(event) => set("accountName")(event.target.value)}
                  maxLength={120}
                  autoComplete="name"
                  className={inputClassName}
                />
              </FormField>
              <FormField
                id="payout-number"
                label={isBank ? "Account number" : `${METHOD_LABEL[form.method]} number`}
                hint={isBank ? undefined : "The 11-digit mobile number, like 01712345678."}
              >
                <input
                  id="payout-number"
                  value={form.accountNumber}
                  onChange={(event) => set("accountNumber")(event.target.value)}
                  inputMode="numeric"
                  maxLength={40}
                  className={inputClassName}
                />
              </FormField>
              {isBank ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField id="payout-bank" label="Bank">
                    <input id="payout-bank" value={form.bankName} onChange={(event) => set("bankName")(event.target.value)} maxLength={120} className={inputClassName} />
                  </FormField>
                  <FormField id="payout-branch" label="Branch">
                    <input id="payout-branch" value={form.branch} onChange={(event) => set("branch")(event.target.value)} maxLength={120} className={inputClassName} />
                  </FormField>
                  <FormField id="payout-routing" label="Routing number (optional)" className="sm:col-span-2">
                    <input
                      id="payout-routing"
                      value={form.routingNumber}
                      onChange={(event) => set("routingNumber")(event.target.value)}
                      inputMode="numeric"
                      maxLength={20}
                      className={inputClassName}
                    />
                  </FormField>
                </div>
              ) : null}
              <FormField id="payout-password" label="Your CivilHub password" hint="Needed to change where you're paid.">
                <input
                  id="payout-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => {
                    setCurrentPassword(event.target.value);
                    setOutcome(null);
                  }}
                  autoComplete="current-password"
                  className={inputClassName}
                />
              </FormField>
              <p className="text-xs text-white/45">Only the CivilHub team sees this. It never appears on your profile.</p>
              {outcome ? (
                <p role={outcome.kind === "error" ? "alert" : "status"} className={`text-sm ${outcome.kind === "error" ? "text-rose-300" : "text-emerald-200"}`}>
                  {outcome.message}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={isSaving} className={primaryButtonClassName}>
                  {isSaving ? "Saving..." : "Save payout account"}
                </button>
                {data.account ? (
                  <button type="button" onClick={() => setIsEditing(false)} disabled={isSaving} className="text-sm font-semibold text-white/60 hover:text-white">
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          ) : data.account ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-void/40 p-4 sm:max-w-xl">
              <p className="text-sm text-white/80">
                <span className="font-semibold text-white">{METHOD_LABEL[data.account.method]}</span>{" "}
                {data.account.accountNumber} · {data.account.accountName}
                {data.account.bankName ? ` · ${data.account.bankName}` : ""}
              </p>
              <button type="button" onClick={startEditing} className="text-sm font-semibold text-primary hover:text-glow">
                Change
              </button>
            </div>
          ) : null}
          {!isEditing && outcome?.kind === "saved" ? (
            <p role="status" className="mt-2 text-sm text-emerald-200">
              {outcome.message}
            </p>
          ) : null}

          <h3 className="mt-8 text-sm font-semibold text-white/80">Payouts</h3>
          {data.payouts.length === 0 ? (
            <p className="mt-1 text-sm text-white/50">Nothing sent yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-white/5 sm:max-w-xl">
              {data.payouts.map((payout) => (
                <li key={payout.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm">
                  <span className="text-white/85">
                    <span className="font-semibold tabular-nums">{formatCurrency(payout.amount)}</span> to {METHOD_LABEL[payout.method]}{" "}
                    {payout.accountNumber}
                    <span className="block font-mono text-xs text-white/45">ref {payout.reference}</span>
                  </span>
                  <span className="text-xs text-white/50">{formatDay(payout.paidAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
