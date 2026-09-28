import {
  DISCIPLINE_LIMIT,
  ENGINEER_DISCIPLINES,
  type EngineerDiscipline,
  isEngineerDiscipline,
} from "../models/Engineer.model";

/**
 * Specialities for engineers and companies alike: one main discipline first,
 * then up to two more, all from ENGINEER_DISCIPLINES. Companies used to type
 * free-text specialties; those are read through `onlyDisciplines` so old
 * entries that aren't on the list simply drop out.
 */

interface DisciplineError extends Error {
  statusCode: number;
}

const disciplineError = (message: string): DisciplineError => {
  const error = new Error(message) as DisciplineError;
  error.statusCode = 400;
  return error;
};

/**
 * Validates a posted list: undefined when absent (leave as is), otherwise the
 * de-duplicated disciplines in the chosen order. `required` demands at least one.
 */
export const parseDisciplines = (
  value: unknown,
  { required = false }: { required?: boolean } = {},
): EngineerDiscipline[] | undefined => {
  if (value === undefined) {
    if (required) throw disciplineError("Choose your main speciality");
    return undefined;
  }
  if (!Array.isArray(value) || !value.every(isEngineerDiscipline)) {
    throw disciplineError("Choose specialities from the list");
  }
  const unique = [...new Set(value)];
  if (required && unique.length === 0) {
    throw disciplineError("Choose your main speciality");
  }
  if (unique.length > DISCIPLINE_LIMIT) {
    throw disciplineError(
      `Choose a main speciality and up to ${DISCIPLINE_LIMIT - 1} more`,
    );
  }
  return unique;
};

const byLowerCase = new Map(
  ENGINEER_DISCIPLINES.map((discipline) => [discipline.toLowerCase(), discipline]),
);

/** Keeps only listed disciplines (any case), in order, capped at the limit. */
export const onlyDisciplines = (
  values: readonly string[] | null | undefined,
): EngineerDiscipline[] => {
  const kept: EngineerDiscipline[] = [];
  for (const value of values ?? []) {
    const discipline = byLowerCase.get(value.trim().toLowerCase());
    if (discipline && !kept.includes(discipline)) kept.push(discipline);
  }
  return kept.slice(0, DISCIPLINE_LIMIT);
};
