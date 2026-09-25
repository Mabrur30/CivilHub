import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useEffect,
  useState,
} from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { EnvelopeIcon, LockIcon, UserIcon } from "@phosphor-icons/react";
import { AuthShell } from "../components/auth/AuthShell";
import { GlassField } from "../components/auth/GlassField";
import { GlassSubmitButton } from "../components/auth/GlassSubmitButton";
import { useAuth } from "../context/AuthContext";

interface SignupPageProps {
  role: "client" | "engineer";
}

interface SignupForm {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const response = value as ErrorResponse;
    if (typeof response.message === "string") {
      return response.message;
    }
  }

  return "Unable to create your account. Please try again.";
};

const roleLabelMap: Record<SignupPageProps["role"], string> = {
  client: "Client",
  engineer: "Engineer",
};

export function SignupPage({ role }: SignupPageProps): ReactElement {
  const [form, setForm] = useState<SignupForm>({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const { refetchUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!role || !roleLabelMap[role]) {
      return;
    }
  }, [role]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.fullName,
          email: form.email,
          password: form.password,
          role,
        }),
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        setError(getErrorMessage(body));
        return;
      }

      await refetchUser();
      navigate(`/dashboard/${role}`);
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!role || !roleLabelMap[role]) {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthShell widthClassName="max-w-xl">
      <p className="mt-5 text-sm font-semibold uppercase tracking-[0.24em] text-primary">
        Join CivilHub
      </p>
      <h1 className="mt-3 font-heading text-4xl font-bold text-white sm:text-5xl">
        Create your account
      </h1>
      <div className="mt-5 inline-flex rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
        Signing up as: {roleLabelMap[role]}
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5 text-left">
        <GlassField
          id="fullName"
          name="fullName"
          label="Full name"
          icon={UserIcon}
          type="text"
          value={form.fullName}
          onChange={handleChange}
          placeholder="Your name"
        />

        <GlassField
          id="email"
          name="email"
          label="Email address"
          icon={EnvelopeIcon}
          type="email"
          value={form.email}
          onChange={handleChange}
          placeholder="you@example.com"
        />

        <GlassField
          id="password"
          name="password"
          label="Password"
          icon={LockIcon}
          type="password"
          value={form.password}
          onChange={handleChange}
          placeholder="Create a secure password"
        />

        <GlassField
          id="confirmPassword"
          name="confirmPassword"
          label="Confirm password"
          icon={LockIcon}
          type="password"
          value={form.confirmPassword}
          onChange={handleChange}
          placeholder="Repeat your password"
        />

        <GlassSubmitButton disabled={isSubmitting}>
          {isSubmitting
            ? "Creating account..."
            : `Continue as ${roleLabelMap[role]}`}
        </GlassSubmitButton>
        {error ? (
          <p role="alert" className="text-center text-sm text-rose-300">
            {error}
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}

export function SignupRoute(): ReactElement {
  const { role } = useParams<{ role: string }>();

  if (role === "client") {
    return <SignupPage role="client" />;
  }

  if (role === "engineer") {
    return <SignupPage role="engineer" />;
  }

  return <Navigate to="/" replace />;
}
