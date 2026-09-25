import { MapPinIcon } from "@phosphor-icons/react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useClientWorkspace } from "../components/dashboard/client/ClientWorkspace";
import { getErrorMessage } from "../components/dashboard/client/clientData";
import { ProjectTimelinePicker } from "../components/dashboard/client/ProjectTimelinePicker";
import {
  inputClassName,
  panelClassName,
  primaryButtonBaseClassName,
} from "../components/dashboard/ui/buttonStyles";
import { MoneyInput } from "../components/dashboard/ui/MoneyInput";
import { PageHeader } from "../components/dashboard/ui/PageHeader";
import { useAuth } from "../context/AuthContext";
import { formatTakaShort, moneyValue, parseMoney } from "../lib/money";
import { describeTimeline, todayIsoDate } from "../lib/timeline";

interface PostProjectForm {
  title: string;
  description: string;
  category: string;
  budgetMin: string;
  budgetMax: string;
  location: string;
  targetStartDate: string;
  targetCompletionDate: string;
}

type FieldName = keyof PostProjectForm;
type FormErrors = Partial<Record<FieldName, string>>;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const initialForm: PostProjectForm = {
  title: "",
  description: "",
  category: "Residential",
  budgetMin: "",
  budgetMax: "",
  location: "",
  targetStartDate: "",
  targetCompletionDate: "",
};

const categories = [
  "Residential",
  "Commercial",
  "Infrastructure",
  "Renovation",
  "Water & drainage",
  "Roads & transport",
];

// Checked in this order, so focus lands on the first problem a reader meets.
const fieldOrder: FieldName[] = [
  "title",
  "category",
  "description",
  "budgetMin",
  "budgetMax",
  "location",
  "targetStartDate",
  "targetCompletionDate",
];

const fieldLabels: Record<FieldName, string> = {
  title: "Project title",
  category: "Category",
  description: "What needs doing",
  budgetMin: "Budget from",
  budgetMax: "Budget up to",
  location: "Location",
  targetStartDate: "Start by",
  targetCompletionDate: "Finish by",
};

const requiredMessages: Record<FieldName, string> = {
  title: "Give the project a title.",
  category: "Choose a category.",
  description: "Describe what needs doing.",
  budgetMin: "Add the lowest budget you'd consider.",
  budgetMax: "Add the most you could spend.",
  location: "Add where the site is.",
  targetStartDate: "Choose when work should start.",
  targetCompletionDate: "Choose how long it should take.",
};

const validate = (form: PostProjectForm): FormErrors => {
  const errors: FormErrors = {};
  for (const field of fieldOrder) {
    if (!form[field].trim()) errors[field] = requiredMessages[field];
  }
  const min = parseMoney(form.budgetMin);
  const max = parseMoney(form.budgetMax);
  // The money box already explains what it couldn't read.
  if (form.budgetMin.trim() && min.value === null) errors.budgetMin = "Check this amount.";
  if (form.budgetMax.trim() && max.value === null) errors.budgetMax = "Check this amount.";
  if (min.value !== null && max.value !== null && max.value <= min.value) {
    errors.budgetMax = "The upper budget has to be more than the lower one.";
  }
  if (form.targetStartDate && form.targetStartDate < todayIsoDate()) {
    errors.targetStartDate = "Pick a start date from today onward.";
  }
  if (
    form.targetStartDate &&
    form.targetCompletionDate &&
    form.targetCompletionDate <= form.targetStartDate
  ) {
    errors.targetCompletionDate = "The finish date has to be after the start date.";
  }
  return errors;
};

/** The brief as an engineer will meet it in the marketplace. */
function BriefPreview({
  form,
  clientName,
}: {
  form: PostProjectForm;
  clientName: string;
}): ReactElement {
  const min = moneyValue(form.budgetMin);
  const max = moneyValue(form.budgetMax);
  const budget =
    min !== null && max !== null
      ? `${formatTakaShort(min)} - ${formatTakaShort(max)}`
      : "Budget to be added";

  return (
    <aside aria-labelledby="preview-heading" className="grid content-start gap-3">
      <h2 id="preview-heading" className="text-sm font-semibold text-white/60">
        How engineers will see it
      </h2>
      <div className={`${panelClassName} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          <span className="rounded-full bg-white/5 px-2.5 py-1 font-semibold text-white/70">
            {form.category}
          </span>
          <span className="text-white/40">Posted just now</span>
        </div>
        <p className="mt-3 font-heading text-2xl font-bold text-white">
          {form.title.trim() || "Your project title"}
        </p>
        <p className="mt-1 text-sm text-white/55">{clientName}</p>
        <p className="mt-3 line-clamp-4 whitespace-pre-line text-sm leading-6 text-white/60">
          {form.description.trim() ||
            "Your description appears here. Engineers decide whether to bid from these few lines."}
        </p>
        <dl className="mt-5 grid gap-3 border-t border-white/10 pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">Budget</dt>
            <dd className="font-semibold tabular-nums text-white/90">{budget}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">Where</dt>
            <dd className="flex items-center gap-1.5 text-white/80">
              <MapPinIcon className="h-4 w-4" aria-hidden="true" />
              {form.location.trim() || "Location to be added"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">When</dt>
            <dd className="text-white/80">
              {describeTimeline(form.targetStartDate, form.targetCompletionDate) ??
                "Timeline to be added"}
            </dd>
          </div>
        </dl>
      </div>
      <p className="text-xs leading-5 text-white/45">
        Briefs with a clear scope and a realistic budget get more bids. Your
        open briefs also appear on your public profile.
      </p>
    </aside>
  );
}

export function PostProjectPage(): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const workspace = useClientWorkspace();
  const routeState = location.state as Partial<PostProjectForm> | null;

  const [form, setForm] = useState<PostProjectForm>(() => ({
    ...initialForm,
    ...(routeState || {}),
  }));
  const [errors, setErrors] = useState<FormErrors>({});
  const [error, setError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ): void => {
    const name = event.target.name as FieldName;
    setForm((current) => ({ ...current, [name]: event.target.value }));
    if (errors[name]) {
      setErrors((current) => ({ ...current, [name]: undefined }));
    }
  };

  const updateField = (name: FieldName, value: string): void => {
    setForm((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const next = validate(form);
    setErrors(next);
    setError("");
    const firstInvalid = fieldOrder.find((field) => next[field]);
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLElement>(`#${firstInvalid}`)?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category,
          budgetMin: moneyValue(form.budgetMin),
          budgetMax: moneyValue(form.budgetMax),
          location: form.location.trim(),
          targetStartDate: form.targetStartDate,
          targetCompletionDate: form.targetCompletionDate,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setError(getErrorMessage(body, "Unable to post your project right now. Please try again."));
        return;
      }
      const id =
        typeof body === "object" && body !== null && typeof (body as { id?: unknown }).id === "string"
          ? (body as { id: string }).id
          : null;
      void workspace?.refresh();
      navigate("/dashboard/client/projects", { state: { justPosted: id } });
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Label above, hint and error below, both tied to the input for screen readers.
  const field = (
    name: FieldName,
    control: (props: {
      id: string;
      name: FieldName;
      "aria-invalid": boolean;
      "aria-describedby"?: string;
    }) => ReactElement,
    hint?: string,
  ): ReactElement => {
    const hintId = hint ? `${name}-hint` : undefined;
    const errorId = errors[name] ? `${name}-error` : undefined;
    const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
    return (
      <div className="grid content-start gap-2">
        <label htmlFor={name} className="text-sm font-semibold text-white/80">
          {fieldLabels[name]}
        </label>
        {control({
          id: name,
          name,
          "aria-invalid": Boolean(errors[name]),
          "aria-describedby": describedBy,
        })}
        {hint ? (
          <p id={hintId} className="text-xs leading-5 text-white/45">
            {hint}
          </p>
        ) : null}
        {errors[name] ? (
          <p id={errorId} className="text-xs text-rose-300">
            {errors[name]}
          </p>
        ) : null}
      </div>
    );
  };

  const inputClass = (name: FieldName): string =>
    `${inputClassName} ${errors[name] ? "border-rose-400/60" : ""}`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Post a project"
        summary={
          routeState?.title
            ? "We filled this in from your cost estimate. Check the details, then post it for bids."
            : "Describe the work, your budget and timeline. Engineers bid on it, and you choose who to hire."
        }
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <form
          ref={formRef}
          onSubmit={(event) => void handleSubmit(event)}
          noValidate
          className={`${panelClassName} grid gap-6 p-5 sm:p-8`}
        >
          {error ? (
            <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </p>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {field(
              "title",
              (props) => (
                <input {...props} value={form.title} onChange={handleChange} maxLength={120} className={inputClass("title")} />
              ),
              "Say what and where, e.g. Six-storey residential frame, Uttara",
            )}
            {field("category", (props) => (
              <select {...props} value={form.category} onChange={handleChange} className={inputClass("category")}>
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            ))}
          </div>

          {field(
            "description",
            (props) => (
              <textarea
                {...props}
                rows={6}
                value={form.description}
                onChange={handleChange}
                className={`${inputClass("description")} resize-y`}
              />
            ),
            "Include the plot size, number of storeys, whether you have a soil test, and any approvals (such as RAJUK) you already hold.",
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            {field("budgetMin", (props) => (
              <MoneyInput
                id={props.id}
                value={form.budgetMin}
                onChange={(value) => updateField("budgetMin", value)}
                invalid={props["aria-invalid"]}
                describedBy={props["aria-describedby"]}
              />
            ))}
            {field("budgetMax", (props) => (
              <MoneyInput
                id={props.id}
                value={form.budgetMax}
                onChange={(value) => updateField("budgetMax", value)}
                invalid={props["aria-invalid"]}
                describedBy={props["aria-describedby"]}
              />
            ))}
          </div>

          {field(
            "location",
            (props) => (
              <input {...props} value={form.location} onChange={handleChange} autoComplete="address-level2" className={inputClass("location")} />
            ),
            "Area and city, e.g. Mirpur, Dhaka",
          )}

          <ProjectTimelinePicker
            start={form.targetStartDate}
            finish={form.targetCompletionDate}
            startError={errors.targetStartDate}
            finishError={errors.targetCompletionDate}
            onChange={({ start, finish }) => {
              setForm((current) => ({
                ...current,
                targetStartDate: start,
                targetCompletionDate: finish,
              }));
              setErrors((current) => ({
                ...current,
                targetStartDate: undefined,
                targetCompletionDate: undefined,
              }));
            }}
          />

          <div className="flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-white/50">
              Engineers can bid as soon as you post. Nothing is charged until
              you hire someone and approve their plan.
            </p>
            <button type="submit" disabled={isSubmitting} className={primaryButtonBaseClassName}>
              {isSubmitting ? "Posting..." : "Post project"}
            </button>
          </div>
        </form>

        <div className="lg:sticky lg:top-24">
          <BriefPreview form={form} clientName={currentUser?.name ?? "You"} />
        </div>
      </div>
    </div>
  );
}
