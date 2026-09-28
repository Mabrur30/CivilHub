import { type LatLng } from "./siteDetails";
import { type ProjectCategoryCriteria, isFieldVisible } from "./projectCriteria";

/** Form values are kept as typed; numbers become numbers on submit. */
export type CriteriaFormValue = string | string[] | { value: string; unit: string };
export type CriteriaFormValues = Record<string, CriteriaFormValue>;

/** Id of a question's control, so the page can focus the first one with an error. */
export const criteriaFieldId = (key: string): string => `req-${key}`;

export interface SiteFormValue {
  point: LatLng | null;
  district: string;
  area: string;
  addressLine: string;
  directions: string;
  vehicleAccess: string;
  utilities: string[];
  documentsAvailable: string[];
}

export const emptySite: SiteFormValue = {
  point: null,
  district: "",
  area: "",
  addressLine: "",
  directions: "",
  vehicleAccess: "",
  utilities: [],
  documentsAvailable: [],
};

export type SiteErrors = Partial<Record<"point" | "district" | "area", string>>;

/** Control ids, so the page can focus the first site field with an error. */
export const SITE_FIELD_IDS = {
  point: "siteSearch",
  district: "siteDistrict",
  area: "siteArea",
} as const;

/** Client-side check matching the server's, so errors show before posting. */
export const validateCriteria = (
  criteria: ProjectCategoryCriteria,
  values: CriteriaFormValues,
): Record<string, string> => {
  const errors: Record<string, string> = {};
  for (const field of criteria.fields) {
    if (!isFieldVisible(field, values)) continue;
    const value = values[field.key];
    const raw =
      typeof value === "object" && !Array.isArray(value) ? value.value : value;
    const blank = raw === undefined || (Array.isArray(raw) ? raw.length === 0 : raw.trim() === "");
    if (blank) {
      if (field.required) errors[field.key] = `Add the ${field.label.toLowerCase()}.`;
      continue;
    }
    if (field.type === "number" || field.type === "area") {
      const amount = Number(raw);
      if (!Number.isFinite(amount)) errors[field.key] = "Enter a number.";
      else if (field.integer && !Number.isInteger(amount)) errors[field.key] = "Enter a whole number.";
      else if (field.min !== undefined && amount < field.min) errors[field.key] = `The smallest allowed is ${field.min}.`;
      else if (field.max !== undefined && amount > field.max) errors[field.key] = `The largest allowed is ${field.max}.`;
    }
  }
  return errors;
};

/** Only the asked questions, with numbers as numbers, ready to post. */
export const toRequirementsPayload = (
  criteria: ProjectCategoryCriteria,
  values: CriteriaFormValues,
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};
  for (const field of criteria.fields) {
    if (!isFieldVisible(field, values)) continue;
    const value = values[field.key];
    if (value === undefined) continue;
    if (field.type === "number") {
      if (typeof value === "string" && value.trim()) payload[field.key] = Number(value);
    } else if (field.type === "area") {
      if (typeof value === "object" && !Array.isArray(value) && value.value.trim()) {
        payload[field.key] = { value: Number(value.value), unit: value.unit };
      }
    } else if (Array.isArray(value)) {
      if (value.length > 0) payload[field.key] = value;
    } else if (typeof value === "string" && value.trim()) {
      payload[field.key] = value.trim();
    }
  }
  return payload;
};
