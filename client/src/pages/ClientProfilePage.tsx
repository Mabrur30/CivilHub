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

export function ClientProfilePage(): ReactElement {
  const { currentUser } = useAuth();
  const [form, setForm] = useState<ClientProfileForm>({
    name: "",
    email: "",
    phone: "",
    companyName: "",
  });
  const [saved, setSaved] = useState<boolean>(false);
  useEffect(() => {
    if (currentUser)
      setForm((current) => ({
        ...current,
        name: currentUser.name,
        email: currentUser.email,
      }));
  }, [currentUser]);
  const handleChange = (event: ChangeEvent<HTMLInputElement>): void =>
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    console.log("Profile saved", form);
    setSaved(true);
  };
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
        onSubmit={handleSubmit}
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
            value={form.name}
            onChange={handleChange}
            className="form-input"
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
          className="w-full rounded-xl bg-primary px-5 py-3.5 text-sm font-semibold text-white shadow-glow hover:bg-glow"
        >
          Save changes
        </button>
        {saved ? (
          <p role="status" className="text-sm text-emerald-300">
            Profile changes saved locally for now.
          </p>
        ) : null}
      </form>
    </div>
  );
}
