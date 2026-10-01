import { type FormEvent, type ReactElement, type ReactNode, useState } from "react";
import {
  inputClassName,
  panelClassName,
  primaryButtonClassName,
} from "../components/dashboard/ui/buttonStyles";
import { FormField } from "../components/dashboard/ui/FormField";
import { PageHeader } from "../components/dashboard/ui/PageHeader";
import { RequiredLegend } from "../components/dashboard/ui/RequiredMark";
import { useAuth } from "../context/AuthContext";
import { BlockedPeoplePanel } from "../components/safety/BlockedPeoplePanel";
import { GettingPaidPanel } from "../components/payouts/GettingPaidPanel";
import { isProviderRole } from "../lib/dashboardPaths";
import { VerificationPanel } from "../components/verification/VerificationPanel";
import { API_BASE_URL } from "../lib/apiBase";

const PASSWORD_MIN = 8;

type Outcome = { kind: "saved" | "error"; message: string } | null;

/** Sends a PATCH to one of the account endpoints; returns an error or "". */
const patchAccount = async (path: string, body: Record<string, string>): Promise<string> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me${path}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return "";
    const result = (await response.json()) as { message?: string };
    return result.message ?? "That didn't save. Please try again.";
  } catch {
    return "Unable to connect to CivilHub. Please try again.";
  }
};

function SettingsPanel({
  id,
  title,
  description,
  outcome,
  isSaving,
  submitLabel,
  onSubmit,
  children,
}: {
  id: string;
  title: string;
  description: string;
  outcome: Outcome;
  isSaving: boolean;
  submitLabel: string;
  onSubmit: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <section className={`${panelClassName} p-6 sm:p-8`} aria-labelledby={id}>
      <h2 id={id} className="font-heading text-2xl font-bold text-white">
        {title}
      </h2>
      <p className="mt-1 text-sm text-white/55">{description}</p>
      <form
        className="mt-5 grid max-w-xl gap-4"
        noValidate
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {children}
        {outcome ? (
          <p
            role={outcome.kind === "error" ? "alert" : "status"}
            className={`text-sm ${outcome.kind === "error" ? "text-rose-300" : "text-emerald-200"}`}
          >
            {outcome.message}
          </p>
        ) : null}
        <button type="submit" disabled={isSaving} className={primaryButtonClassName}>
          {isSaving ? "Saving..." : submitLabel}
        </button>
      </form>
    </section>
  );
}

export function AccountSettingsPage(): ReactElement {
  const { currentUser, refetchUser } = useAuth();

  const [name, setName] = useState<string>(currentUser?.name ?? "");
  const [nameOutcome, setNameOutcome] = useState<Outcome>(null);
  const [isSavingName, setIsSavingName] = useState<boolean>(false);

  const [email, setEmail] = useState<string>(currentUser?.email ?? "");
  const [emailPassword, setEmailPassword] = useState<string>("");
  const [emailOutcome, setEmailOutcome] = useState<Outcome>(null);
  const [isSavingEmail, setIsSavingEmail] = useState<boolean>(false);

  const [currentPassword, setCurrentPassword] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [passwordOutcome, setPasswordOutcome] = useState<Outcome>(null);
  const [isSavingPassword, setIsSavingPassword] = useState<boolean>(false);

  const isCompany = currentUser?.role === "organisation";

  const saveName = async (): Promise<void> => {
    if (name.trim().length < 2) {
      setNameOutcome({ kind: "error", message: "Enter at least 2 characters." });
      return;
    }
    setIsSavingName(true);
    const error = await patchAccount("", { name: name.trim() });
    setIsSavingName(false);
    if (error) {
      setNameOutcome({ kind: "error", message: error });
      return;
    }
    setNameOutcome({ kind: "saved", message: "Name updated." });
    await refetchUser();
  };

  const saveEmail = async (): Promise<void> => {
    if (!emailPassword) {
      setEmailOutcome({ kind: "error", message: "Enter your current password to change your email." });
      return;
    }
    setIsSavingEmail(true);
    const error = await patchAccount("/email", { email: email.trim(), currentPassword: emailPassword });
    setIsSavingEmail(false);
    if (error) {
      setEmailOutcome({ kind: "error", message: error });
      return;
    }
    setEmailPassword("");
    setEmailOutcome({ kind: "saved", message: "Email updated. Use it the next time you sign in." });
    await refetchUser();
  };

  const savePassword = async (): Promise<void> => {
    if (newPassword.length < PASSWORD_MIN) {
      setPasswordOutcome({ kind: "error", message: `Your new password must be at least ${PASSWORD_MIN} characters.` });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordOutcome({ kind: "error", message: "The new passwords don't match." });
      return;
    }
    setIsSavingPassword(true);
    const error = await patchAccount("/password", { currentPassword, newPassword });
    setIsSavingPassword(false);
    if (error) {
      setPasswordOutcome({ kind: "error", message: error });
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordOutcome({ kind: "saved", message: "Password changed." });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Account settings"
        summary="Your name, the email you sign in with, your password, and people you've blocked."
      />
      <RequiredLegend className="-mt-4" />

      <SettingsPanel
        id="settings-name"
        title={isCompany ? "Company name" : "Name"}
        description={
          isCompany
            ? "Shown on your company profile, bids and messages."
            : "Shown on your profile, bids, reviews and messages."
        }
        outcome={nameOutcome}
        isSaving={isSavingName}
        submitLabel="Save name"
        onSubmit={() => void saveName()}
      >
        <FormField id="account-name" label={isCompany ? "Company name" : "Full name"} required>
          <input
            id="account-name"
            value={name}
            maxLength={80}
            autoComplete={isCompany ? "organization" : "name"}
            onChange={(event) => {
              setName(event.target.value);
              setNameOutcome(null);
            }}
            className={inputClassName}
          />
        </FormField>
      </SettingsPanel>

      <SettingsPanel
        id="settings-email"
        title="Email"
        description="You sign in with this address, and CivilHub sends notices to it."
        outcome={emailOutcome}
        isSaving={isSavingEmail}
        submitLabel="Change email"
        onSubmit={() => void saveEmail()}
      >
        <FormField id="account-email" label="Email address" required>
          <input
            id="account-email"
            type="email"
            value={email}
            autoComplete="email"
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailOutcome(null);
            }}
            className={inputClassName}
          />
        </FormField>
        <FormField id="account-email-password" label="Current password" required>
          <input
            id="account-email-password"
            type="password"
            value={emailPassword}
            autoComplete="current-password"
            onChange={(event) => {
              setEmailPassword(event.target.value);
              setEmailOutcome(null);
            }}
            className={inputClassName}
          />
        </FormField>
      </SettingsPanel>

      <SettingsPanel
        id="settings-password"
        title="Password"
        description={`At least ${PASSWORD_MIN} characters.`}
        outcome={passwordOutcome}
        isSaving={isSavingPassword}
        submitLabel="Change password"
        onSubmit={() => void savePassword()}
      >
        <FormField id="account-current-password" label="Current password" required>
          <input
            id="account-current-password"
            type="password"
            value={currentPassword}
            autoComplete="current-password"
            onChange={(event) => {
              setCurrentPassword(event.target.value);
              setPasswordOutcome(null);
            }}
            className={inputClassName}
          />
        </FormField>
        <FormField id="account-new-password" label="New password" required>
          <input
            id="account-new-password"
            type="password"
            value={newPassword}
            autoComplete="new-password"
            onChange={(event) => {
              setNewPassword(event.target.value);
              setPasswordOutcome(null);
            }}
            className={inputClassName}
          />
        </FormField>
        <FormField id="account-confirm-password" label="Confirm new password" required>
          <input
            id="account-confirm-password"
            type="password"
            value={confirmPassword}
            autoComplete="new-password"
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setPasswordOutcome(null);
            }}
            className={inputClassName}
          />
        </FormField>
      </SettingsPanel>

      {/* Engineers and companies are verified and paid through CivilHub; clients only pay. */}
      {currentUser && isProviderRole(currentUser.role) ? <VerificationPanel /> : null}
      {currentUser && isProviderRole(currentUser.role) ? <GettingPaidPanel /> : null}

      <BlockedPeoplePanel />
    </div>
  );
}
