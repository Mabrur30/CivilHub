import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useEffect,
  useState,
} from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
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
    <main className="min-h-screen bg-void px-4 py-12 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl rounded-[32px] border border-white/10 bg-surface p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] sm:p-10">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-primary/60 bg-primary/10 text-lg font-bold text-primary">
            C
          </div>
          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.24em] text-primary">
            Join CivilHub
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
            Create your account
          </h1>
          <div className="mt-5 inline-flex rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
            Signing up as: {roleLabelMap[role]}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="fullName"
              className="mb-2 block text-sm font-semibold text-white/80"
            >
              Full name
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              value={form.fullName}
              onChange={handleChange}
              className="w-full rounded-2xl border border-white/10 bg-void px-4 py-3 text-base text-white placeholder:text-white/35 focus:border-primary focus:outline-none"
              placeholder="Your name"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-semibold text-white/80"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              className="w-full rounded-2xl border border-white/10 bg-void px-4 py-3 text-base text-white placeholder:text-white/35 focus:border-primary focus:outline-none"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-semibold text-white/80"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              className="w-full rounded-2xl border border-white/10 bg-void px-4 py-3 text-base text-white placeholder:text-white/35 focus:border-primary focus:outline-none"
              placeholder="Create a secure password"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-2 block text-sm font-semibold text-white/80"
            >
              Confirm password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={handleChange}
              className="w-full rounded-2xl border border-white/10 bg-void px-4 py-3 text-base text-white placeholder:text-white/35 focus:border-primary focus:outline-none"
              placeholder="Repeat your password"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-primary px-5 py-3.5 text-base font-semibold text-white shadow-glow transition-all duration-300 hover:-translate-y-0.5 hover:bg-glow"
          >
            {isSubmitting
              ? "Creating account..."
              : `Continue as ${roleLabelMap[role]}`}
          </button>
          {error ? (
            <p role="alert" className="text-center text-sm text-red-300">
              {error}
            </p>
          ) : null}
        </form>
      </div>
    </main>
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
