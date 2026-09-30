import { type FormEvent, type ReactElement, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ErrorNote, panel, primaryButton } from "../components/ui";
import { useAuth } from "../lib/auth";

export function LoginPage(): ReactElement {
  const { admin, isChecking, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isBusy, setIsBusy] = useState<boolean>(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (!isChecking && admin) return <Navigate to={from} replace />;

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setIsBusy(true);
    setError("");
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
      setPassword("");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={(event) => void submit(event)} className={`${panel} w-full max-w-sm p-7`} noValidate>
        <p className="font-heading text-2xl font-bold text-white">
          CivilHub <span className="text-primary">Admin</span>
        </p>
        <p className="mt-1 text-sm text-white/55">Staff only. Every action here is logged.</p>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-1.5 text-sm font-semibold text-white/80">
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="form-input font-normal"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-white/80">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="form-input font-normal"
              required
            />
          </label>
          <ErrorNote message={error} />
          <button type="submit" className={`${primaryButton} w-full py-2.5`} disabled={isBusy || !email || !password}>
            {isBusy ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </form>
    </main>
  );
}
