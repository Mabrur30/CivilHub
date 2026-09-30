import { type ReactElement, useCallback, useEffect, useState } from "react";
import { DialogActions, ErrorNote, Loading, Modal, PageHeader, panel, primaryButton } from "../components/ui";
import { type PlatformSettings, adminApi } from "../lib/api";
import { formatDateTime } from "../lib/format";

const asPercent = (rate: number): string => `${Math.round(rate * 10000) / 100}%`;

function CommissionDialog({
  current,
  onDone,
  onClose,
}: {
  current: number;
  onDone: () => void;
  onClose: () => void;
}): ReactElement {
  const [percent, setPercent] = useState<string>(String(Math.round(current * 10000) / 100));
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const value = Number(percent);
  const valid = percent !== "" && Number.isFinite(value) && value >= 0 && value <= 50;

  const submit = async (): Promise<void> => {
    if (!valid) return setError("Enter a rate from 0% to 50%.");
    if (!reason.trim()) return setError("Give a reason. It goes in the log.");
    setIsBusy(true);
    setError("");
    try {
      await adminApi("/settings/commission", { method: "POST", body: { percent: value, reason: reason.trim() } });
      onDone();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      setIsBusy(false);
    }
  };

  return (
    <Modal
      title="Change the commission"
      description="Applies to payments started from now on. Payments already made keep the fee they were charged."
      isBusy={isBusy}
      onClose={onClose}
    >
      <label className="mt-5 grid gap-1.5 text-sm font-semibold text-white/80">
        Commission (%)
        <input
          type="number"
          min={0}
          max={50}
          step="0.1"
          inputMode="decimal"
          value={percent}
          onChange={(event) => {
            setPercent(event.target.value);
            setError("");
          }}
          className="form-input w-32"
        />
      </label>
      {valid ? (
        <p className="mt-3 rounded-xl bg-white/5 p-3 text-sm text-white/70">
          On a ৳10,000 phase payment, CivilHub keeps ৳{(100 * value).toLocaleString("en-US")} and the provider gets ৳
          {(10000 - 100 * value).toLocaleString("en-US")}. Rental deposits are never charged.
        </p>
      ) : null}
      <label className="mt-4 grid gap-1.5 text-sm font-semibold text-white/80">
        Reason
        <textarea
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setError("");
          }}
          rows={3}
          maxLength={500}
          className="form-input font-normal"
        />
      </label>
      <div className="mt-3">
        <ErrorNote message={error} />
      </div>
      <DialogActions isBusy={isBusy} confirmLabel="Save" onCancel={onClose} onConfirm={() => void submit()} />
    </Modal>
  );
}

/** Platform settings. Every change is written to the action log. */
export function SettingsPage(): ReactElement {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [error, setError] = useState<string>("");
  const [isEditing, setIsEditing] = useState<boolean>(false);

  const load = useCallback((): void => {
    adminApi<PlatformSettings>("/settings")
      .then(setSettings)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Couldn't load settings."));
  }, []);

  useEffect(load, [load]);

  return (
    <>
      <PageHeader title="Settings" intro="Platform-wide settings. Every change is recorded in the action log with the old and new value." />
      <ErrorNote message={error} />
      {!settings && !error ? <Loading /> : null}
      {settings ? (
        <section className={`${panel} max-w-xl p-6`} aria-labelledby="commission-heading">
          <h2 id="commission-heading" className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
            Commission
          </h2>
          <p className="mt-2 font-heading text-4xl font-bold text-white tabular-nums">{asPercent(settings.commissionRate)}</p>
          <p className="mt-1 text-sm text-white/60">
            CivilHub keeps this share of every project payment and rental fee, taken from the provider's side. Deposits are never
            charged.
          </p>
          <p className="mt-3 text-xs text-white/45">
            {settings.commissionSource === "admin"
              ? `Set by ${settings.updatedBy ?? "an admin"}${settings.updatedAt ? ` on ${formatDateTime(settings.updatedAt)}` : ""}.`
              : `The default from the server's configuration (${asPercent(settings.defaultCommissionRate)}); no admin has changed it.`}
          </p>
          <button type="button" className={`${primaryButton} mt-5`} onClick={() => setIsEditing(true)}>
            Change
          </button>
        </section>
      ) : null}
      {isEditing && settings ? (
        <CommissionDialog
          current={settings.commissionRate}
          onClose={() => setIsEditing(false)}
          onDone={() => {
            setIsEditing(false);
            load();
          }}
        />
      ) : null}
    </>
  );
}
