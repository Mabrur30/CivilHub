import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useEffect,
  useState,
} from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  BuildingsIcon,
  CheckIcon,
  EnvelopeIcon,
  LockIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { AuthShell } from "../components/auth/AuthShell";
import { GlassField } from "../components/auth/GlassField";
import { GlassSubmitButton } from "../components/auth/GlassSubmitButton";
import {
  useAuth,
  type CompanyService,
  type UserRole,
} from "../context/AuthContext";
import { dashboardBase } from "../lib/dashboardPaths";
import { SpecialityChooser } from "../components/profile/shared/SpecialityChooser";
import { API_BASE_URL } from "../lib/apiBase";

interface SignupPageProps {
  role: UserRole;
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
  organisation: "Company",
};

// What a company does decides which tools it gets; it can change this later.
const companyServices: Array<{
  value: CompanyService;
  title: string;
  hint: string;
}> = [
  {
    value: "equipment",
    title: "Rent out equipment",
    hint: "List machines such as excavators, cranes and mixers for hire.",
  },
  {
    value: "projects",
    title: "Take on projects",
    hint: "Bid on client projects and deliver them phase by phase.",
  },
];

export function SignupPage({ role }: SignupPageProps): ReactElement {
  const [form, setForm] = useState<SignupForm>({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [services, setServices] = useState<CompanyService[]>([]);
  const [disciplines, setDisciplines] = useState<string[]>([]);
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

  const isCompany = role === "organisation";
  // Engineers always have a speciality; a company only if it takes on projects.
  const asksSpeciality =
    role === "engineer" || (isCompany && services.includes("projects"));

  const toggleService = (service: CompanyService): void => {
    setServices((current) =>
      current.includes(service)
        ? current.filter((item) => item !== service)
        : [...current, service],
    );
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
    if (isCompany && services.length === 0) {
      setError("Choose what your company does: rent out equipment, take on projects, or both.");
      return;
    }
    if (asksSpeciality && disciplines.length === 0) {
      setError(
        isCompany
          ? "Choose what your company specialises in."
          : "Choose your main speciality.",
      );
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
          ...(isCompany ? { services } : {}),
          ...(asksSpeciality ? { disciplines } : {}),
        }),
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        setError(getErrorMessage(body));
        return;
      }

      await refetchUser();
      navigate(dashboardBase(role));
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
      <p className="mt-3 text-sm text-white/55">
        {isCompany ? (
          <>
            Signing up for yourself?{" "}
            <Link to="/signup/engineer" className="font-semibold text-primary hover:underline">
              Engineer
            </Link>{" "}
            or{" "}
            <Link to="/signup/client" className="font-semibold text-primary hover:underline">
              client
            </Link>
          </>
        ) : (
          <>
            Signing up a firm or plant-hire company?{" "}
            <Link to="/signup/company" className="font-semibold text-primary hover:underline">
              Create a company account
            </Link>
          </>
        )}
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5 text-left">
        <GlassField
          id="fullName"
          name="fullName"
          label={isCompany ? "Company name" : "Full name"}
          icon={isCompany ? BuildingsIcon : UserIcon}
          type="text"
          value={form.fullName}
          onChange={handleChange}
          placeholder={isCompany ? "e.g. Rahman Plant Hire Ltd" : "Your name"}
        />

        {isCompany ? (
          <fieldset>
            <legend className="mb-2 block text-sm font-semibold text-white/80">
              What does your company do?
            </legend>
            <p className="mb-3 text-xs text-white/50">
              Choose one or both. You can change this later in your company
              profile.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {companyServices.map((service) => {
                const isChosen = services.includes(service.value);
                return (
                  <label
                    key={service.value}
                    className={`glass-field flex cursor-pointer items-start gap-3 rounded-2xl p-4 transition-colors ${
                      isChosen ? "ring-1 ring-primary" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={isChosen}
                      onChange={() => toggleService(service.value)}
                    />
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-glow ${
                        isChosen
                          ? "border-primary bg-primary text-on-primary"
                          : "border-white/30"
                      }`}
                    >
                      {isChosen ? <CheckIcon size={12} weight="bold" /> : null}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-white">
                        {service.title}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-white/55">
                        {service.hint}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {asksSpeciality ? (
          <SpecialityChooser
            value={disciplines}
            onChange={(next) => {
              setDisciplines(next);
              setError("");
            }}
            legend={isCompany ? "What does your company specialise in?" : "What's your speciality?"}
            hint="Pick your main speciality first, then up to 2 more. Clients find and filter engineers by these, and you can change them later."
          />
        ) : null}

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

  if (role === "company" || role === "organisation") {
    return <SignupPage role="organisation" />;
  }

  return <Navigate to="/" replace />;
}
