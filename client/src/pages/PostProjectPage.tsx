import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useState,
} from "react";

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
type FormErrors = Partial<Record<keyof PostProjectForm, string>>;

const initialForm: PostProjectForm = {
  title: "",
  description: "",
  category: "Infrastructure",
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

export function PostProjectPage(): ReactElement {
  const [form, setForm] = useState<PostProjectForm>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState<boolean>(false);
  const handleChange = (
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ): void =>
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  const validate = (): FormErrors => {
    const next: FormErrors = {};
    const required: Array<keyof PostProjectForm> = [
      "title",
      "description",
      "category",
      "budgetMin",
      "budgetMax",
      "location",
      "targetStartDate",
      "targetCompletionDate",
    ];
    required.forEach((field) => {
      if (!form[field].trim()) next[field] = "This field is required.";
    });
    if (
      form.budgetMin &&
      form.budgetMax &&
      Number(form.budgetMin) >= Number(form.budgetMax)
    )
      next.budgetMax = "Maximum budget must be greater than minimum.";
    if (
      form.targetStartDate &&
      form.targetCompletionDate &&
      form.targetCompletionDate <= form.targetStartDate
    )
      next.targetCompletionDate = "Completion must be after the start date.";
    return next;
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length === 0) {
      console.log("Project submitted", form);
      setSubmitted(true);
    }
  };
  if (submitted)
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-10 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Project submitted
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold text-white">
          Your brief is ready.
        </h1>
        <p className="mt-4 text-white/65">
          We will use these details to help identify the right delivery
          partners.
        </p>
        <button
          type="button"
          onClick={() => {
            setForm(initialForm);
            setErrors({});
            setSubmitted(false);
          }}
          className="mt-7 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-glow"
        >
          Post another project
        </button>
      </section>
    );
  const fieldError = (field: keyof PostProjectForm): ReactElement | null =>
    errors[field] ? (
      <p className="mt-2 text-xs text-red-300">{errors[field]}</p>
    ) : null;
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
          Start a new brief
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Post a Project
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Give qualified engineering partners the context they need to respond
          with confidence.
        </p>
      </div>
      <form
        onSubmit={handleSubmit}
        className="max-w-3xl space-y-6 rounded-2xl border border-white/10 bg-surface p-6 sm:p-8"
      >
        <div>
          <label
            htmlFor="title"
            className="mb-2 block text-sm font-semibold text-white/80"
          >
            Project title
          </label>
          <input
            id="title"
            name="title"
            value={form.title}
            onChange={handleChange}
            className="form-input"
            placeholder="e.g. Northline By-Pass"
          />
          {fieldError("title")}
        </div>
        <div>
          <label
            htmlFor="description"
            className="mb-2 block text-sm font-semibold text-white/80"
          >
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={5}
            value={form.description}
            onChange={handleChange}
            className="form-input resize-none"
            placeholder="Describe the scope, constraints, and expected outcomes"
          />
          {fieldError("description")}
        </div>
        <div>
          <label
            htmlFor="category"
            className="mb-2 block text-sm font-semibold text-white/80"
          >
            Category
          </label>
          <select
            id="category"
            name="category"
            value={form.category}
            onChange={handleChange}
            className="form-input"
          >
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
          {fieldError("category")}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="budgetMin"
              className="mb-2 block text-sm font-semibold text-white/80"
            >
              Minimum budget
            </label>
            <input
              id="budgetMin"
              name="budgetMin"
              type="number"
              min="0"
              value={form.budgetMin}
              onChange={handleChange}
              className="form-input"
              placeholder="0"
            />
            {fieldError("budgetMin")}
          </div>
          <div>
            <label
              htmlFor="budgetMax"
              className="mb-2 block text-sm font-semibold text-white/80"
            >
              Maximum budget
            </label>
            <input
              id="budgetMax"
              name="budgetMax"
              type="number"
              min="0"
              value={form.budgetMax}
              onChange={handleChange}
              className="form-input"
              placeholder="0"
            />
            {fieldError("budgetMax")}
          </div>
        </div>
        <div>
          <label
            htmlFor="location"
            className="mb-2 block text-sm font-semibold text-white/80"
          >
            Location
          </label>
          <input
            id="location"
            name="location"
            value={form.location}
            onChange={handleChange}
            className="form-input"
            placeholder="City, region, or country"
          />
          {fieldError("location")}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="targetStartDate"
              className="mb-2 block text-sm font-semibold text-white/80"
            >
              Target start date
            </label>
            <input
              id="targetStartDate"
              name="targetStartDate"
              type="date"
              value={form.targetStartDate}
              onChange={handleChange}
              className="form-input"
            />
            {fieldError("targetStartDate")}
          </div>
          <div>
            <label
              htmlFor="targetCompletionDate"
              className="mb-2 block text-sm font-semibold text-white/80"
            >
              Target completion date
            </label>
            <input
              id="targetCompletionDate"
              name="targetCompletionDate"
              type="date"
              value={form.targetCompletionDate}
              onChange={handleChange}
              className="form-input"
            />
            {fieldError("targetCompletionDate")}
          </div>
        </div>
        <button
          type="submit"
          className="w-full rounded-xl bg-primary px-5 py-3.5 text-sm font-semibold text-white shadow-glow hover:bg-glow"
        >
          Submit Project Brief
        </button>
      </form>
    </div>
  );
}
