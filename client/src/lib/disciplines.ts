// Mirrors ENGINEER_DISCIPLINES in server/src/models/Engineer.model.ts.
export const ENGINEER_DISCIPLINES = [
  "Structural",
  "Civil & site works",
  "Geotechnical",
  "MEP",
  "Architecture & design",
  "Surveying",
  "Project management",
  "Quantity surveying",
  "Water & drainage",
  "Roads & transport",
] as const;

export type EngineerDiscipline = (typeof ENGINEER_DISCIPLINES)[number];

export const DISCIPLINE_LIMIT = 3;
