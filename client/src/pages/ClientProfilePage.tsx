import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useEffect,
  useState,
} from "react";
import { useAuth } from "../context/AuthContext";

interface ClientProfileForm {
  name: string;
  email: string;
  phone: string;
  companyName: string;
}

interface ClientProfileResponse {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  companyName: string;
}

interface UpdateClientProfileBody {
  phone?: string;
  companyName?: string;
}

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const isClientProfile = (value: unknown): value is ClientProfileResponse => {
  if (typeof value !== "object" || value === null) return false;
  const profile = value as Record<string, unknown>;
  return (
    typeof profile.id === "string" &&
    typeof profile.userId === "string" &&
    typeof profile.name === "string" &&
    typeof profile.email === "string" &&
    typeof profile.phone === "string" &&
    typeof profile.companyName === "string"
  );
};

const getErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value === "object" && value !== null) {
    const response = value as ErrorResponse;
    if (typeof response.message === "string") return response.message;
  }
  return fallback;
};

export function ClientProfilePage(): ReactElement {
  const { currentUser } = useAuth();
  const [form, setForm] = useState<ClientProfileForm>({
    name: "",
    email: "",
    phone: "",
    companyName: "",
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>("");
  const [saveError, setSaveError] = useState<string>("");
  const [saved, setSaved] = useState<boolean>(false);

  useEffect(() => {
    if (currentUser) {
      setForm((current) => ({
        ...current,
        name: currentUser.name,
        email: currentUser.email,
      }));
    }
  }, [currentUser]);

  useEffect(() => {
    const loadProfile = async (): Promise<void> => {
      setIsLoading(true);
      setLoadError("");
      try {
        const response = await fetch(`${API_BASE_URL}/api/clients/me`, {
          credentials: "include",
        });
        const body: unknown = await response.json();
        if (!response.ok || !isClientProfile(body)) {
          setLoadError(getErrorMessage(body, "Unable to load your profile."));
          return;
        }
        setForm({
          name: body.name,
          email: body.email,
          phone: body.phone,
          companyName: body.companyName,
        });
      } catch {
        setLoadError("Unable to connect to CivilHub. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };
    void loadProfile();
  }, []);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
    setSaved(false);
    setSaveError("");
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setIsSubmitting(true);
    setSaved(false);
    setSaveError("");
    const body: UpdateClientProfileBody = {
      phone: form.phone,
      companyName: form.companyName,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/clients/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const responseBody: unknown = await response.json();
      if (!response.ok || !isClientProfile(responseBody)) {
        setSaveError(
          getErrorMessage(responseBody, "Unable to save your profile."),
        );
        return;
      }
      setForm((current) => ({
        ...current,
        phone: responseBody.phone,
        companyName: responseBody.companyName,
      }));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3500);
    } catch {
      setSaveError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="animate-pulse rounded-2xl border border-white/10 bg-surface p-8 text-white/50">
        Loading profile...
      </div>
    );
  }

  if (loadError) {
    return (
      <section
        className="max-w-2xl rounded-2xl border border-red-400/20 bg-red-400/5 p-8 text-center"
        role="alert"
      >
        <p className="text-sm text-red-200">{loadError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary"
        >
          Try again
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
          Account settings
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Profile
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Keep your contact details current for the teams delivering your
          projects.
        </p>
      </div>
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="max-w-2xl space-y-5 rounded-2xl border border-white/10 bg-surface p-6 sm:p-8"
      >
        <div>
          <label
            htmlFor="profile-name"
            className="mb-2 block text-sm font-semibold text-white/80"
          >
            Name
          </label>
          <input
            id="profile-name"
            name="name"
            required
            readOnly
            value={form.name}
            className="form-input cursor-not-allowed opacity-60"
          />
        </div>
        <div>
          <label
            htmlFor="profile-email"
            className="mb-2 block text-sm font-semibold text-white/80"
          >
            Email address
          </label>
          <input
            id="profile-email"
            name="email"
            type="email"
            readOnly
            value={form.email}
            className="form-input cursor-not-allowed opacity-60"
          />
        </div>
        <div>
          <label
            htmlFor="profile-phone"
            className="mb-2 block text-sm font-semibold text-white/80"
          >
            Phone
          </label>
          <input
            id="profile-phone"
            name="phone"
            type="tel"
            value={form.phone}
            onChange={handleChange}
            className="form-input"
            placeholder="+1 555 000 0000"
          />
        </div>
        <div>
          <label
            htmlFor="profile-company"
            className="mb-2 block text-sm font-semibold text-white/80"
          >
            Company name{" "}
            <span className="font-normal text-white/40">(optional)</span>
          </label>
          <input
            id="profile-company"
            name="companyName"
            value={form.companyName}
            onChange={handleChange}
            className="form-input"
            placeholder="Your company"
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-primary px-5 py-3.5 text-sm font-semibold text-white shadow-glow hover:bg-glow disabled:cursor-wait disabled:opacity-60"
        >
          {isSubmitting ? "Saving..." : "Save changes"}
        </button>
        {saved ? (
          <p role="status" className="text-sm text-emerald-300">
            Profile changes saved.
          </p>
        ) : null}
        {saveError ? (
          <p role="alert" className="text-sm text-red-300">
            {saveError}
          </p>
        ) : null}
      </form>
    </div>
  );
}
