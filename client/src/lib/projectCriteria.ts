import { useEffect, useState } from "react";

/**
 * The questions each project type asks, served by GET /api/projects/criteria
 * (server/src/utils/projectCriteria.ts is the source). The post-project form
 * is rendered from it and the brief pages label answers with it, so a new
 * question only has to be added on the server.
 */

export interface CriteriaOption {
  value: string;
  label: string;
  short?: string;
}

export interface CriteriaField {
  key: string;
  label: string;
  hint?: string;
  type: "number" | "area" | "select" | "multi" | "text";
  group: string;
  required?: boolean;
  options?: CriteriaOption[];
  units?: CriteriaOption[];
  unit?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  maxLength?: number;
  showIf?: { key: string; in: string[] };
  summary?: { order: number; template?: string };
}

export interface ProjectCategoryCriteria {
  category: string;
  title: string;
  description: string;
  fields: CriteriaField[];
}

export interface BdDistrict {
  name: string;
  division: string;
}

export interface ProjectCriteriaSpec {
  categories: ProjectCategoryCriteria[];
  services: CriteriaOption[];
  districts: BdDistrict[];
  siteOptions: {
    vehicleAccess: CriteriaOption[];
    utilities: CriteriaOption[];
    documentsAvailable: CriteriaOption[];
  };
}

export type AreaValue = { value: number; unit: string };
export type RequirementValue = number | string | string[] | AreaValue;
export type ProjectRequirements = Record<string, RequirementValue>;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

// The spec changes only with a deploy, so one fetch serves the whole visit.
let cachedSpec: ProjectCriteriaSpec | null = null;
let pendingSpec: Promise<ProjectCriteriaSpec> | null = null;

const isSpec = (value: unknown): value is ProjectCriteriaSpec =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as ProjectCriteriaSpec).categories) &&
  Array.isArray((value as ProjectCriteriaSpec).districts);

const loadSpec = (): Promise<ProjectCriteriaSpec> => {
  if (cachedSpec) return Promise.resolve(cachedSpec);
  pendingSpec ??= fetch(`${API_BASE_URL}/api/projects/criteria`)
    .then(async (response) => {
      const body: unknown = await response.json();
      if (!response.ok || !isSpec(body)) throw new Error("Bad criteria");
      cachedSpec = body;
      return body;
    })
    .finally(() => {
      pendingSpec = null;
    });
  return pendingSpec;
};

export interface ProjectCriteriaState {
  spec: ProjectCriteriaSpec | null;
  error: boolean;
  retry: () => void;
}

export const useProjectCriteria = (): ProjectCriteriaState => {
  const [spec, setSpec] = useState<ProjectCriteriaSpec | null>(cachedSpec);
  const [error, setError] = useState<boolean>(false);
  const [attempt, setAttempt] = useState<number>(0);

  useEffect(() => {
    if (spec) return;
    let active = true;
    loadSpec()
      .then((loaded) => {
        if (active) setSpec(loaded);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [spec, attempt]);

  return {
    spec,
    error,
    retry: () => {
      setError(false);
      setAttempt((current) => current + 1);
    },
  };
};

export const findCategory = (
  spec: ProjectCriteriaSpec | null,
  category: string,
): ProjectCategoryCriteria | null =>
  spec?.categories.find((entry) => entry.category === category) ?? null;

/** Whether a field is asked, given the other answers (its showIf rule). */
export const isFieldVisible = (
  field: CriteriaField,
  values: Partial<Record<string, unknown>>,
): boolean => {
  if (!field.showIf) return true;
  const controlling = values[field.showIf.key];
  if (Array.isArray(controlling)) {
    return controlling.some((value) => field.showIf?.in.includes(String(value)));
  }
  return typeof controlling === "string" && field.showIf.in.includes(controlling);
};

const numberFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

const optionLabel = (options: CriteriaOption[] | undefined, value: string): string =>
  options?.find((option) => option.value === value)?.label ?? value;

export const isAreaValue = (value: unknown): value is AreaValue =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as AreaValue).value === "number";

/** An answer as the brief page shows it, e.g. "5 katha" or "RCC frame". */
export const formatRequirement = (
  field: CriteriaField,
  value: RequirementValue,
): string => {
  if (typeof value === "number") {
    return `${numberFormat.format(value)}${field.unit ? ` ${field.unit}` : ""}`;
  }
  if (typeof value === "string") {
    return field.type === "text" ? value : optionLabel(field.options, value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => optionLabel(field.options, entry)).join(", ");
  }
  return `${numberFormat.format(value.value)} ${value.unit === "sqft" ? "sq ft" : value.unit}`;
};

const summaryPart = (field: CriteriaField, value: RequirementValue): string | null => {
  const fill = (template: string, amount: number, unit = ""): string =>
    template
      .replace("{value}", numberFormat.format(amount))
      .replace("{unit}", unit)
      .replace("{s}", amount === 1 ? "" : "s");
  const short = (entry: string): string | null => {
    if (entry === "not_sure" || entry === "none") return null;
    const option = field.options?.find((candidate) => candidate.value === entry);
    return option ? (option.short ?? option.label) : null;
  };

  if (typeof value === "number") {
    return value === 0
      ? null
      : fill(field.summary?.template ?? `{value} ${field.unit ?? ""}`.trim(), value);
  }
  if (typeof value === "string") return short(value);
  if (Array.isArray(value)) {
    const labels = value.map(short).filter((entry): entry is string => Boolean(entry));
    if (labels.length === 0) return null;
    return labels.length > 2
      ? `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`
      : labels.join(", ");
  }
  return fill(
    field.summary?.template ?? "{value} {unit}",
    value.value,
    value.unit === "sqft" ? "sq ft" : value.unit,
  );
};

/**
 * The card's one-line summary. Mirrors summariseRequirements on the server,
 * so the post-project preview matches what the marketplace will show.
 */
export const summariseRequirements = (
  criteria: ProjectCategoryCriteria | null,
  values: ProjectRequirements,
  limit = 4,
): string | null => {
  if (!criteria) return null;
  const parts = criteria.fields
    .filter((field) => field.summary && values[field.key] !== undefined)
    .filter((field) => isFieldVisible(field, values))
    .sort((a, b) => (a.summary?.order ?? 0) - (b.summary?.order ?? 0))
    .map((field) => summaryPart(field, values[field.key]))
    .filter((part): part is string => Boolean(part))
    .slice(0, limit);
  return parts.length > 0 ? parts.join(" · ") : null;
};

/** Groups a category's fields under their headings, in spec order. */
export const groupFields = (
  fields: CriteriaField[],
): Array<{ group: string; fields: CriteriaField[] }> => {
  const groups: Array<{ group: string; fields: CriteriaField[] }> = [];
  for (const field of fields) {
    const existing = groups.find((entry) => entry.group === field.group);
    if (existing) existing.fields.push(field);
    else groups.push({ group: field.group, fields: [field] });
  }
  return groups;
};
