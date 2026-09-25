import { type FormEvent, type ReactElement, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EnvelopeIcon, LockIcon } from "@phosphor-icons/react";
import { AuthShell } from "../components/auth/AuthShell";
import { GlassField } from "../components/auth/GlassField";
import { GlassSubmitButton } from "../components/auth/GlassSubmitButton";
import { useAuth } from "../context/AuthContext";

interface LoginForm {
  email: string;
  password: string;
}

interface LoginResponse {
  role: "client" | "engineer";
}

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const isLoginResponse = (value: unknown): value is LoginResponse => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const response = value as Record<string, unknown>;
  return response.role === "client" || response.role === "engineer";
};

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const response = value as ErrorResponse;
    if (typeof response.message === "string") {
      return response.message;
    }
  }

  return "Unable to log in. Please check your credentials.";
};

export function LoginPage(): ReactElement {
  const [form, setForm] = useState<LoginForm>({ email: "", password: "" });
  const [error, setError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const { refetchUser } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const body: unknown = await response.json();

      if (!response.ok || !isLoginResponse(body)) {
        setError(getErrorMessage(body));
        return;
      }

      await refetchUser();
      navigate(`/dashboard/${body.role}`);
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="mt-6 font-heading text-4xl font-bold text-white">
        Login
      </h1>
      <p className="mt-4 text-base text-white/70">
        Sign in to continue to your CivilHub workspace.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5 text-left">
        <GlassField
          id="login-email"
          label="Email address"
          icon={EnvelopeIcon}
          type="email"
          required
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          placeholder="you@example.com"
        />
        <GlassField
          id="login-password"
          label="Password"
          icon={LockIcon}
          type="password"
          required
          value={form.password}
          onChange={(event) =>
            setForm({ ...form, password: event.target.value })
          }
          placeholder="Your password"
        />
        {error ? (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        ) : null}
        <GlassSubmitButton disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Log In"}
        </GlassSubmitButton>
      </form>
      <p className="mt-6 text-sm text-white/50">
        New to CivilHub?{" "}
        <Link
          to="/?signup=choose-role"
          className="font-semibold text-primary hover:text-glow"
        >
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
