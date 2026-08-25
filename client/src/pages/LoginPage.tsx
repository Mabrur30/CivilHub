import { type FormEvent, type ReactElement, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
    <main className="flex min-h-screen items-center justify-center bg-void px-4 py-12 text-white sm:px-6">
      <div className="w-full max-w-lg rounded-[32px] border border-white/10 bg-surface p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.35)] sm:p-12">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-primary/60 bg-primary/10 text-lg font-bold text-primary">
          C
        </div>
        <h1 className="mt-6 font-heading text-4xl font-bold tracking-[-0.04em] text-white">
          Login
        </h1>
        <p className="mt-4 text-base text-white/70">
          Sign in to continue to your CivilHub workspace.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5 text-left">
          <div>
            <label
              htmlFor="login-email"
              className="mb-2 block text-sm font-semibold text-white/80"
            >
              Email address
            </label>
            <input
              id="login-email"
              type="email"
              required
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
              className="w-full rounded-2xl border border-white/10 bg-void px-4 py-3 text-base text-white placeholder:text-white/35 focus:border-primary focus:outline-none"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label
              htmlFor="login-password"
              className="mb-2 block text-sm font-semibold text-white/80"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              required
              value={form.password}
              onChange={(event) =>
                setForm({ ...form, password: event.target.value })
              }
              className="w-full rounded-2xl border border-white/10 bg-void px-4 py-3 text-base text-white placeholder:text-white/35 focus:border-primary focus:outline-none"
              placeholder="Your password"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-primary px-5 py-3.5 text-base font-semibold text-white shadow-glow transition-all duration-300 hover:-translate-y-0.5 hover:bg-glow disabled:cursor-wait disabled:opacity-60"
          >
            {isSubmitting ? "Signing in..." : "Log In"}
          </button>
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
      </div>
    </main>
  );
}
