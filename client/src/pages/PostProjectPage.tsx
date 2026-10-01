import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  type ReactNode,
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
import { ErrorPanel } from "../components/dashboard/ui/StatePanels";
import { SiteMap } from "../components/map/LazySiteMap";
import { BriefCard } from "../components/project/BriefCard";
import { CategoryIcon } from "../components/project/CategoryIcon";
import { ChoiceChips } from "../components/project/ChoiceChips";
import { CriteriaFields } from "../components/project/CriteriaFields";
import { SiteAccessFields } from "../components/project/SiteAccessFields";
import { SiteLocationPicker } from "../components/project/SiteLocationPicker";
import { useAuth } from "../context/AuthContext";
import { formatBudgetShort, moneyValue, parseMoney } from "../lib/money";
import {
  type ProjectCategoryCriteria,
  type ProjectRequirements,
  findCategory,
  summariseRequirements,
  useProjectCriteria,
} from "../lib/projectCriteria";
import {
  type CriteriaFormValue,
  type CriteriaFormValues,
  SITE_FIELD_IDS,
  type SiteErrors,
  type SiteFormValue,
  criteriaFieldId,
  emptySite,
  toRequirementsPayload,
  validateCriteria,
} from "../lib/projectForm";
import { siteLabel } from "../lib/siteDetails";
import { describeTimeline, todayIsoDate } from "../lib/timeline";
import { API_BASE_URL } from "../lib/apiBase";

interface PostProjectForm {
  title: string;
  description: string;
  category: string;
  budgetMin: string;
  budgetMax: string;
  targetStartDate: string;
  targetCompletionDate: string;
}

type FieldName = keyof PostProjectForm;
type FormErrors = Partial<Record<FieldName, string>>;

/** What the cost estimator (or another page) can hand over to pre-fill. */
type PostProjectRouteState = Partial<PostProjectForm> & {
  site?: Partial<Pick<SiteFormValue, "district" | "area">>;
  requirements?: CriteriaFormValues;
};

const initialForm: PostProjectForm = {
  title: "",
  description: "",
  category: "Residential",
  budgetMin: "",
  budgetMax: "",
  targetStartDate: "",
  targetCompletionDate: "",
};

const fieldLabels: Record<FieldName, string> = {
  title: "Project title",
  category: "Type of project",
  description: "What needs doing",
  budgetMin: "Budget from",
  budgetMax: "Budget up to",
  targetStartDate: "Start by",
  targetCompletionDate: "Finish by",
};

const requiredMessages: Record<FieldName, string> = {
  title: "Give the project a title.",
  category: "Choose the type of project.",
  description: "Describe what needs doing.",
  budgetMin: "Add the lowest budget you'd consider.",
  budgetMax: "Add the most you could spend.",
  targetStartDate: "Choose when work should start.",
  targetCompletionDate: "Choose how long it should take.",
};

const validate = (form: PostProjectForm): FormErrors => {
  const errors: FormErrors = {};
  for (const field of Object.keys(requiredMessages) as FieldName[]) {
    if (!form[field].trim()) errors[field] = requiredMessages[field];
  }
  const min = parseMoney(form.budgetMin);
  const max = parseMoney(form.budgetMax);
  // The money box already explains what it couldn't read.
  if (form.budgetMin.trim() && min.value === null)
    errors.budgetMin = "Check this amount.";
  if (form.budgetMax.trim() && max.value === null)
    errors.budgetMax = "Check this amount.";
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
    errors.targetCompletionDate =
      "The finish date has to be after the start date.";
  }
  return errors;
};

const validateSite = (site: SiteFormValue): SiteErrors => {
  const errors: SiteErrors = {};
  if (!site.point) errors.point = "Pin the site on the map.";
  if (!site.district) errors.district = "Choose the district.";
  if (!site.area.trim()) errors.area = "Add the area, thana or upazila.";
  return errors;
};

/** A numbered part of the form with its heading. */
function FormSection({
  step,
  title,
  summary,
  children,
}: {
  step: number;
  title: string;
  summary?: string;
  children: ReactNode;
}): ReactElement {
  const headingId = `post-section-${step}`;
  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-6 border-t border-white/10 pt-8 first:border-t-0 first:pt-0"
    >
      <div>
        <h2 id={headingId} className="flex items-baseline gap-3 font-heading text-2xl font-bold text-white">
          <span className="text-base tabular-nums text-primary">{step}</span>
          {title}
        </h2>
        {summary ? <p className="mt-1 text-sm text-white/50">{summary}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** The project types as a grid of radio cards. */
function CategoryPicker({
  categories,
  value,
  error,
  onChange,
}: {
  categories: ProjectCategoryCriteria[];
  value: string;
  error?: string;
  onChange: (category: string) => void;
}): ReactElement {
  return (
    <fieldset className="grid gap-3" aria-describedby={error ? "category-error" : undefined}>
      <legend className="mb-2 text-sm font-semibold text-white/80">{fieldLabels.category}</legend>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {categories.map((entry, index) => {
          const checked = entry.category === value;
          return (
            <label
              key={entry.category}
              className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-glow ${
                checked
                  ? "border-primary bg-primary/10"
                  : "border-white/10 bg-void/40 hover:border-white/30"
              }`}
            >
              <input
                id={index === 0 ? "category" : undefined}
                type="radio"
                name="category"
                value={entry.category}
                checked={checked}
                onChange={() => onChange(entry.category)}
                className="sr-only"
              />
              <CategoryIcon
                category={entry.category}
                weight={checked ? "fill" : "regular"}
                className={`mt-0.5 h-6 w-6 shrink-0 ${checked ? "text-primary" : "text-white/50"}`}
              />
              <span className="grid gap-0.5">
                <span className={`text-sm font-semibold ${checked ? "text-white" : "text-white/85"}`}>
                  {entry.title}
                </span>
                <span className="text-xs leading-5 text-white/50">{entry.description}</span>
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id="category-error" className="text-xs text-rose-300">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** The brief as an engineer will meet it in the marketplace. */
function BriefPreview({
  form,
  site,
  categoryTitle,
  facts,
  clientName,
}: {
  form: PostProjectForm;
  site: SiteFormValue;
  categoryTitle: string;
  facts: string | null;
  clientName: string;
}): ReactElement {
  const hasArea = Boolean(site.area.trim() && site.district);
  return (
    <aside
      aria-labelledby="preview-heading"
      className="grid content-start gap-3"
    >
      <h2 id="preview-heading" className="text-sm font-semibold text-white/60">
        How engineers will see it
      </h2>
      <BriefCard
        category={categoryTitle}
        posted="Posted just now"
        title={form.title.trim() || "Your project title"}
        client={clientName}
        description={
          form.description.trim() ||
          "Your description appears here. Engineers decide whether to bid from these few lines."
        }
        facts={facts ?? undefined}
        budget={formatBudgetShort(
          moneyValue(form.budgetMin),
          moneyValue(form.budgetMax),
          "Budget to be added",
        )}
        location={
          hasArea
            ? siteLabel({ area: site.area.trim(), district: site.district })
            : "Location to be added"
        }
        timeline={
          describeTimeline(form.targetStartDate, form.targetCompletionDate) ??
          "Timeline to be added"
        }
      />
      {site.point ? (
        <div className="grid gap-2">
          <SiteMap
            mode="approx"
            value={site.point}
            radiusM={500}
            label="The approximate area engineers will see"
            className="h-44"
          />
          <p className="text-xs leading-5 text-white/45">
            Engineers see a shaded area about 500 m across, not your pin. The
            exact spot, address and directions go only to the engineer you hire.
          </p>
        </div>
      ) : null}
      <p className="text-xs leading-5 text-white/45">
        Briefs with clear requirements and a realistic budget get more bids. Your
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
  const { spec, error: specError, retry: retrySpec } = useProjectCriteria();
  const routeState = location.state as PostProjectRouteState | null;

  const [form, setForm] = useState<PostProjectForm>(() => ({
    ...initialForm,
    title: routeState?.title ?? "",
    description: routeState?.description ?? "",
    category: routeState?.category ?? initialForm.category,
    budgetMin: routeState?.budgetMin ?? "",
    budgetMax: routeState?.budgetMax ?? "",
    targetStartDate: routeState?.targetStartDate ?? "",
    targetCompletionDate: routeState?.targetCompletionDate ?? "",
  }));
  const [servicesNeeded, setServicesNeeded] = useState<string[]>([]);
  const [site, setSite] = useState<SiteFormValue>(() => ({
    ...emptySite,
    district: routeState?.site?.district ?? "",
    area: routeState?.site?.area ?? "",
  }));
  // Answers kept per type, so switching type and back loses nothing.
  const [requirements, setRequirements] = useState<Record<string, CriteriaFormValues>>(() =>
    routeState?.requirements
      ? { [routeState.category ?? initialForm.category]: routeState.requirements }
      : {},
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [siteErrors, setSiteErrors] = useState<SiteErrors>({});
  const [requirementErrors, setRequirementErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const criteria = findCategory(spec, form.category);
  const categoryValues = requirements[form.category] ?? {};
  const requirementsPayload = criteria ? toRequirementsPayload(criteria, categoryValues) : {};
  const facts = summariseRequirements(criteria, requirementsPayload as ProjectRequirements);

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ): void => {
    const name = event.target.name as FieldName;
    updateField(name, event.target.value);
  };

  const updateField = (name: FieldName, value: string): void => {
    setForm((current) => ({ ...current, [name]: value }));
    if (errors[name])
      setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const updateRequirement = (key: string, value: CriteriaFormValue): void => {
    setRequirements((current) => ({
      ...current,
      [form.category]: { ...(current[form.category] ?? {}), [key]: value },
    }));
    if (requirementErrors[key]) {
      setRequirementErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  };

  const updateSite = (patch: Partial<SiteFormValue>): void => {
    setSite((current) => ({ ...current, ...patch }));
    setSiteErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) {
        if (key === "point" || key === "district" || key === "area") delete next[key];
      }
      return next;
    });
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!criteria) return;
    const nextErrors = validate(form);
    const nextSiteErrors = validateSite(site);
    const nextRequirementErrors = validateCriteria(criteria, categoryValues);
    setErrors(nextErrors);
    setSiteErrors(nextSiteErrors);
    setRequirementErrors(nextRequirementErrors);
    setError("");

    // Focus lands on the first problem a reader meets, top to bottom.
    const problems: Array<[string, unknown]> = [
      ["title", nextErrors.title],
      ["category", nextErrors.category],
      ["description", nextErrors.description],
      ...criteria.fields.map(
        (field): [string, unknown] => [criteriaFieldId(field.key), nextRequirementErrors[field.key]],
      ),
      [SITE_FIELD_IDS.point, nextSiteErrors.point],
      [SITE_FIELD_IDS.district, nextSiteErrors.district],
      [SITE_FIELD_IDS.area, nextSiteErrors.area],
      ["budgetMin", nextErrors.budgetMin],
      ["budgetMax", nextErrors.budgetMax],
      ["targetStartDate", nextErrors.targetStartDate],
      ["targetCompletionDate", nextErrors.targetCompletionDate],
    ];
    const firstInvalid = problems.find(([, problem]) => problem)?.[0];
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
          targetStartDate: form.targetStartDate,
          targetCompletionDate: form.targetCompletionDate,
          servicesNeeded,
          requirements: requirementsPayload,
          site: {
            lat: site.point?.lat,
            lng: site.point?.lng,
            district: site.district,
            area: site.area.trim(),
            addressLine: site.addressLine.trim(),
            directions: site.directions.trim(),
            vehicleAccess: site.vehicleAccess || undefined,
            utilities: site.utilities,
            documentsAvailable: site.documentsAvailable,
          },
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setError(
          getErrorMessage(
            body,
            "Unable to post your project right now. Please try again.",
          ),
        );
        return;
      }
      const id =
        typeof body === "object" &&
        body !== null &&
        typeof (body as { id?: unknown }).id === "string"
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
    const describedBy =
      [hintId, errorId].filter(Boolean).join(" ") || undefined;
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

  const header = (
    <PageHeader
      title="Post a project"
      summary={
        routeState?.title
          ? "We filled this in from your cost estimate. Check the details, pin the site, then post it for bids."
          : "Tell engineers what you're building, where, and your budget and timeline. They bid on it, and you choose who to hire."
      }
    />
  );

  if (!spec) {
    return (
      <div className="space-y-8">
        {header}
        {specError ? (
          <ErrorPanel message="Unable to load the project form." onRetry={retrySpec} />
        ) : (
          <div aria-busy="true" className={`${panelClassName} h-96 animate-pulse`} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {header}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <form
          ref={formRef}
          onSubmit={(event) => void handleSubmit(event)}
          noValidate
          className={`${panelClassName} grid gap-8 p-5 sm:p-8`}
        >
          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200"
            >
              {error}
            </p>
          ) : null}

          <FormSection step={1} title="The project">
            {field(
              "title",
              (props) => (
                <input
                  {...props}
                  value={form.title}
                  onChange={handleChange}
                  maxLength={120}
                  className={inputClass("title")}
                />
              ),
              "Say what and where, e.g. Six-storey residential frame, Uttara",
            )}
            <CategoryPicker
              categories={spec.categories}
              value={form.category}
              error={errors.category}
              onChange={(category) => {
                updateField("category", category);
                setRequirementErrors({});
              }}
            />
            <ChoiceChips
              multiple
              id="servicesNeeded"
              name="servicesNeeded"
              legend="What you need from an engineer"
              note="(choose any)"
              options={spec.services}
              value={servicesNeeded}
              onChange={setServicesNeeded}
            />
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
              "Anything the questions below don't cover: the design you have in mind, known problems, who to contact on site.",
            )}
          </FormSection>

          {criteria ? (
            <FormSection
              step={2}
              title={`${criteria.title} details`}
              summary="What engineers need to price this kind of work. Answer what you know; “Not sure” is fine."
            >
              <CriteriaFields
                criteria={criteria}
                values={categoryValues}
                errors={requirementErrors}
                onChange={updateRequirement}
              />
            </FormSection>
          ) : null}

          <FormSection
            step={3}
            title="The site"
            summary="Pin the exact plot so the engineer you hire can find it."
          >
            <SiteLocationPicker
              value={site}
              districts={spec.districts}
              errors={siteErrors}
              onChange={updateSite}
            />
            <SiteAccessFields
              value={site}
              options={spec.siteOptions}
              onChange={updateSite}
            />
          </FormSection>

          <FormSection step={4} title="Budget and timeline">
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
          </FormSection>

          <div className="flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-white/50">
              Engineers can bid as soon as you post. Nothing is charged until
              you hire someone and approve their plan.
            </p>
            <button
              type="submit"
              disabled={isSubmitting}
              className={primaryButtonBaseClassName}
            >
              {isSubmitting ? "Posting..." : "Post project"}
            </button>
          </div>
        </form>

        <div className="lg:sticky lg:top-24">
          <BriefPreview
            form={form}
            site={site}
            categoryTitle={criteria?.title ?? form.category}
            facts={facts}
            clientName={currentUser?.name ?? "You"}
          />
        </div>
      </div>
    </div>
  );
}
