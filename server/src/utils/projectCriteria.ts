/**
 * What each kind of project asks the client, so engineers get the facts they
 * need to price it. The client renders its form from this spec (served by
 * GET /api/projects/criteria) and the server validates and summarises posted
 * briefs with it, so the two never drift apart.
 */

export interface CriteriaOption {
  value: string;
  label: string;
  /** Wording for the one-line summary on the brief card. */
  short?: string;
}

export type CriteriaFieldType = "number" | "area" | "select" | "multi" | "text";

export interface CriteriaField {
  key: string;
  label: string;
  hint?: string;
  type: CriteriaFieldType;
  /** Heading the field sits under in the form and on the brief page. */
  group: string;
  required?: boolean;
  options?: CriteriaOption[];
  /** Units a plot or land area can be given in. */
  units?: CriteriaOption[];
  /** Unit shown after a plain number, such as "ft" or "m". */
  unit?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  maxLength?: number;
  /** Only asked when another field holds one of these values. */
  showIf?: { key: string; in: string[] };
  /**
   * Place on the brief card's summary line (lower first). `{value}` and
   * `{unit}` are filled in; `{s}` becomes "s" unless the value is 1.
   */
  summary?: { order: number; template?: string };
}

export interface ProjectCategoryCriteria {
  category: string;
  title: string;
  description: string;
  fields: CriteriaField[];
}

export type RequirementValue =
  | number
  | string
  | string[]
  | { value: number; unit: string };

export type ProjectRequirements = Record<string, RequirementValue>;

const NOT_SURE: CriteriaOption = { value: "not_sure", label: "Not sure" };
const YES_NO: CriteriaOption[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
const YES_NO_UNSURE: CriteriaOption[] = [...YES_NO, NOT_SURE];

const AREA_UNITS: CriteriaOption[] = [
  { value: "katha", label: "Katha" },
  { value: "decimal", label: "Decimal (shotangsho)" },
  { value: "bigha", label: "Bigha" },
  { value: "sqft", label: "sq ft" },
];

const areaUnitShort: Record<string, string> = {
  katha: "katha",
  decimal: "decimal",
  bigha: "bigha",
  sqft: "sq ft",
};

const SOIL_TEST: CriteriaField = {
  key: "soilTest",
  label: "Soil test",
  hint: "A soil (sub-soil investigation) report decides the foundation design.",
  type: "select",
  group: "Site status",
  required: true,
  options: [
    { value: "done", label: "Done", short: "Soil test done" },
    { value: "not_done", label: "Not done yet", short: "No soil test yet" },
    NOT_SURE,
  ],
};

const approvalFields = (authorities: string[]): CriteriaField[] => [
  {
    key: "approval",
    label: "Building approval",
    hint: "Plan approval from RAJUK, CDA, a pourashava or similar.",
    type: "select",
    group: "Site status",
    required: true,
    options: [
      { value: "approved", label: "Approved", short: "Plan approved" },
      { value: "applied", label: "Applied for", short: "Approval applied" },
      { value: "not_applied", label: "Not applied yet", short: "Needs approval" },
      NOT_SURE,
    ],
  },
  {
    key: "approvalAuthority",
    label: "Approving authority",
    type: "select",
    group: "Site status",
    options: authorities.map((name) => ({
      value: name.toLowerCase().replace(/[^a-z]+/g, "_"),
      label: name,
    })),
    showIf: { key: "approval", in: ["approved", "applied"] },
  },
];

const BUILDING_AUTHORITIES = [
  "RAJUK",
  "CDA",
  "KDA",
  "RDA",
  "City Corporation",
  "Pourashava",
  "Union Parishad",
  "Other",
];

const plotArea = (label = "Plot size"): CriteriaField => ({
  key: "plotArea",
  label,
  type: "area",
  group: "Building",
  required: true,
  units: AREA_UNITS,
  min: 0.1,
  max: 100_000,
  summary: { order: 2, template: "{value} {unit}" },
});

const storeys: CriteriaField = {
  key: "storeys",
  label: "Storeys above ground",
  type: "number",
  group: "Building",
  required: true,
  integer: true,
  min: 1,
  max: 60,
  summary: { order: 3, template: "{value} storey{s}" },
};

const basements: CriteriaField = {
  key: "basements",
  label: "Basements",
  type: "number",
  group: "Building",
  integer: true,
  min: 0,
  max: 5,
  summary: { order: 5, template: "{value} basement{s}" },
};

const floorArea: CriteriaField = {
  key: "floorArea",
  label: "Total floor area",
  hint: "All floors together, if you know it.",
  type: "number",
  group: "Building",
  unit: "sq ft",
  min: 1,
  max: 5_000_000,
};

const roadWidth: CriteriaField = {
  key: "roadWidth",
  label: "Road in front of the plot",
  hint: "Road width decides how tall you may build and how materials arrive.",
  type: "number",
  group: "Site status",
  unit: "ft",
  min: 1,
  max: 300,
};

const structuralSystem = (extra: CriteriaOption[] = []): CriteriaField => ({
  key: "structuralSystem",
  label: "Structural system",
  type: "select",
  group: "Building",
  options: [
    { value: "rcc_frame", label: "RCC frame" },
    { value: "load_bearing", label: "Load-bearing brick" },
    { value: "steel", label: "Steel structure" },
    ...extra,
    NOT_SURE,
  ],
});

const currentSite: CriteriaField = {
  key: "siteCondition",
  label: "What's on the site now",
  type: "select",
  group: "Site status",
  options: [
    { value: "vacant", label: "Empty plot" },
    { value: "demolish", label: "Old building to demolish", short: "Demolition needed" },
  ],
};

const lengthM = (label: string, order: number, template: string): CriteriaField => ({
  key: "lengthM",
  label,
  type: "number",
  group: "Scope",
  required: true,
  unit: "m",
  min: 0.5,
  max: 500_000,
  summary: { order, template },
});

const authority = (names: string[], label = "Owner or authority"): CriteriaField => ({
  key: "authority",
  label,
  type: "select",
  group: "Site status",
  options: names.map((name) => ({
    value: name.toLowerCase().replace(/[^a-z]+/g, "_"),
    label: name,
  })),
});

const surveyAvailable: CriteriaField = {
  key: "surveyAvailable",
  label: "Topographic survey available",
  type: "select",
  group: "Site status",
  options: YES_NO,
};

export const PROJECT_CRITERIA: ProjectCategoryCriteria[] = [
  {
    category: "Residential",
    title: "Residential building",
    description: "Houses, duplexes and apartment buildings.",
    fields: [
      {
        key: "buildingType",
        label: "Type of building",
        type: "select",
        group: "Building",
        required: true,
        options: [
          { value: "single_house", label: "Single-family house", short: "House" },
          { value: "duplex", label: "Duplex", short: "Duplex" },
          { value: "apartment", label: "Apartment building", short: "Apartment" },
        ],
        summary: { order: 1 },
      },
      plotArea(),
      storeys,
      basements,
      {
        key: "flatsPerFloor",
        label: "Flats per floor",
        type: "number",
        group: "Building",
        integer: true,
        min: 1,
        max: 20,
        showIf: { key: "buildingType", in: ["apartment"] },
      },
      floorArea,
      structuralSystem(),
      {
        key: "lift",
        label: "Lift",
        type: "select",
        group: "Building",
        options: YES_NO_UNSURE,
      },
      {
        key: "parking",
        label: "Parking",
        type: "select",
        group: "Building",
        options: [
          { value: "ground", label: "Ground floor" },
          { value: "basement", label: "Basement" },
          { value: "none", label: "None" },
        ],
      },
      currentSite,
      roadWidth,
      { ...SOIL_TEST, summary: { order: 4 } },
      ...approvalFields(BUILDING_AUTHORITIES),
    ],
  },
  {
    category: "Commercial",
    title: "Commercial & institutional",
    description: "Offices, shops, schools, hospitals, factories and warehouses.",
    fields: [
      {
        key: "occupancy",
        label: "What the building is for",
        type: "select",
        group: "Building",
        required: true,
        options: [
          { value: "office", label: "Office", short: "Office" },
          { value: "retail", label: "Shop or market", short: "Retail" },
          { value: "hospitality", label: "Hotel or restaurant", short: "Hospitality" },
          { value: "education", label: "School or college", short: "School" },
          { value: "health", label: "Hospital or clinic", short: "Healthcare" },
          { value: "industrial", label: "Factory or warehouse", short: "Factory" },
          { value: "mixed", label: "Mixed use", short: "Mixed use" },
        ],
        summary: { order: 1 },
      },
      plotArea(),
      storeys,
      basements,
      floorArea,
      structuralSystem([{ value: "peb", label: "Pre-engineered steel (PEB)" }]),
      {
        key: "specialLoads",
        label: "Special loads",
        type: "multi",
        group: "Special requirements",
        options: [
          { value: "machinery", label: "Heavy machinery" },
          { value: "crane", label: "Overhead crane" },
          { value: "cold_storage", label: "Cold storage" },
        ],
        showIf: { key: "occupancy", in: ["industrial"] },
      },
      {
        key: "fireCompliance",
        label: "Fire-safety / BNBC compliance needed",
        hint: "Fire Service licence, fire exits, sprinklers and BNBC checks.",
        type: "select",
        group: "Special requirements",
        options: YES_NO_UNSURE,
      },
      {
        key: "lift",
        label: "Lift",
        type: "select",
        group: "Special requirements",
        options: YES_NO_UNSURE,
      },
      {
        key: "power",
        label: "Substation or generator",
        type: "select",
        group: "Special requirements",
        options: [
          { value: "substation", label: "Substation" },
          { value: "generator", label: "Generator" },
          { value: "both", label: "Both" },
          { value: "none", label: "Neither" },
          NOT_SURE,
        ],
      },
      currentSite,
      roadWidth,
      { ...SOIL_TEST, summary: { order: 4 } },
      ...approvalFields([...BUILDING_AUTHORITIES.slice(0, -1), "BEZA", "BEPZA", "Other"]),
    ],
  },
  {
    category: "Renovation",
    title: "Renovation, extension & repair",
    description: "Adding floors, retrofits, repairs and refurbishing a building.",
    fields: [
      {
        key: "workTypes",
        label: "What needs doing",
        type: "multi",
        group: "Scope",
        required: true,
        options: [
          { value: "add_floors", label: "Add floors (vertical extension)", short: "Adding floors" },
          { value: "horizontal", label: "Horizontal extension", short: "Extension" },
          { value: "interior", label: "Interior renovation", short: "Interior" },
          { value: "structural_repair", label: "Structural repair or retrofit", short: "Structural repair" },
          { value: "waterproofing", label: "Waterproofing or damp", short: "Waterproofing" },
          { value: "facade", label: "Façade", short: "Façade" },
        ],
        summary: { order: 1 },
      },
      {
        key: "existingStoreys",
        label: "Storeys the building has now",
        type: "number",
        group: "Existing building",
        required: true,
        integer: true,
        min: 1,
        max: 60,
        summary: { order: 2, template: "{value}-storey building" },
      },
      {
        key: "storeysToAdd",
        label: "Storeys to add",
        type: "number",
        group: "Scope",
        integer: true,
        min: 1,
        max: 30,
        showIf: { key: "workTypes", in: ["add_floors"] },
        summary: { order: 3, template: "+{value} storey{s}" },
      },
      {
        key: "buildingAge",
        label: "Age of the building",
        type: "number",
        group: "Existing building",
        unit: "years",
        integer: true,
        min: 0,
        max: 200,
        summary: { order: 5, template: "{value} years old" },
      },
      {
        key: "existingDrawings",
        label: "Original structural drawings",
        hint: "Engineers need these to check whether the frame can take more load.",
        type: "select",
        group: "Existing building",
        required: true,
        options: [
          { value: "yes", label: "Have them", short: "Drawings available" },
          { value: "partly", label: "Some of them", short: "Partial drawings" },
          { value: "no", label: "Don't have them", short: "No drawings" },
        ],
        summary: { order: 4 },
      },
      {
        key: "problems",
        label: "Problems you can see",
        type: "multi",
        group: "Existing building",
        options: [
          { value: "cracks", label: "Cracks" },
          { value: "damp", label: "Damp or leaks" },
          { value: "settlement", label: "Settlement or tilt" },
          { value: "corrosion", label: "Rusting rods or spalling" },
          { value: "none", label: "None" },
        ],
      },
      {
        key: "occupied",
        label: "People living or working there during the work",
        type: "select",
        group: "Scope",
        options: YES_NO,
      },
      {
        key: "testingWanted",
        label: "Structural testing wanted",
        hint: "Core test, rebound hammer or rebar scan to assess the existing frame.",
        type: "select",
        group: "Scope",
        options: YES_NO_UNSURE,
      },
    ],
  },
  {
    category: "Roads & transport",
    title: "Roads & transport",
    description: "New roads, widening, resurfacing and repair.",
    fields: [
      {
        key: "workType",
        label: "Type of work",
        type: "select",
        group: "Scope",
        required: true,
        options: [
          { value: "new", label: "New road", short: "New road" },
          { value: "widening", label: "Widening", short: "Road widening" },
          { value: "resurfacing", label: "Resurfacing", short: "Resurfacing" },
          { value: "repair", label: "Repair", short: "Road repair" },
        ],
        summary: { order: 1 },
      },
      lengthM("Length", 2, "{value} m long"),
      {
        key: "widthM",
        label: "Width",
        type: "number",
        group: "Scope",
        required: true,
        unit: "m",
        min: 0.5,
        max: 200,
        summary: { order: 3, template: "{value} m wide" },
      },
      {
        key: "pavement",
        label: "Pavement",
        type: "select",
        group: "Scope",
        options: [
          { value: "bituminous", label: "Bituminous (carpeting)", short: "Bituminous" },
          { value: "rcc", label: "RCC (rigid)", short: "RCC" },
          { value: "hbb", label: "Herring-bone brick (HBB)", short: "HBB" },
          NOT_SURE,
        ],
        summary: { order: 4 },
      },
      {
        key: "traffic",
        label: "Traffic it must carry",
        type: "select",
        group: "Scope",
        options: [
          { value: "light", label: "Light (cars, rickshaws)" },
          { value: "medium", label: "Medium (buses, pickups)" },
          { value: "heavy", label: "Heavy trucks", short: "Heavy traffic" },
        ],
        summary: { order: 5 },
      },
      {
        key: "sideDrain",
        label: "Side drain needed",
        type: "select",
        group: "Scope",
        options: YES_NO_UNSURE,
      },
      {
        key: "culverts",
        label: "Culverts along the road",
        type: "number",
        group: "Scope",
        integer: true,
        min: 0,
        max: 200,
      },
      surveyAvailable,
      authority(["LGED", "RHD", "City Corporation", "Pourashava", "Union Parishad", "Private"]),
    ],
  },
  {
    category: "Water & drainage",
    title: "Water & drainage",
    description: "Water supply, tube wells, tanks, drains, septic tanks and treatment.",
    fields: [
      {
        key: "systems",
        label: "What needs building",
        type: "multi",
        group: "Scope",
        required: true,
        options: [
          { value: "supply_line", label: "Water supply line", short: "Supply line" },
          { value: "tube_well", label: "Deep tube well", short: "Deep tube well" },
          { value: "tank", label: "Overhead or underground tank", short: "Water tank" },
          { value: "surface_drain", label: "Surface drain", short: "Drain" },
          { value: "sewer_line", label: "Sewer line", short: "Sewer line" },
          { value: "septic", label: "Septic tank or soak pit", short: "Septic tank" },
          { value: "stp", label: "Sewage treatment plant (STP)", short: "STP" },
          { value: "rainwater", label: "Rainwater harvesting", short: "Rainwater harvesting" },
        ],
        summary: { order: 1 },
      },
      {
        key: "lineLength",
        label: "Length of pipe or drain",
        type: "number",
        group: "Scope",
        unit: "m",
        min: 1,
        max: 500_000,
        showIf: { key: "systems", in: ["supply_line", "surface_drain", "sewer_line"] },
        summary: { order: 2, template: "{value} m of line" },
      },
      {
        key: "tankCapacity",
        label: "Tank capacity",
        type: "number",
        group: "Scope",
        unit: "litres",
        min: 100,
        max: 50_000_000,
        showIf: { key: "systems", in: ["tank"] },
        summary: { order: 3, template: "{value} L tank" },
      },
      {
        key: "peopleServed",
        label: "People it serves",
        type: "number",
        group: "Scope",
        integer: true,
        min: 1,
        max: 10_000_000,
        summary: { order: 4, template: "Serves {value} people" },
      },
      {
        key: "groundwaterDepth",
        label: "Groundwater depth",
        hint: "Roughly how deep existing tube wells nearby reach water.",
        type: "number",
        group: "Site status",
        unit: "ft",
        min: 1,
        max: 3000,
      },
      {
        key: "floodProne",
        label: "Floods or waterlogs",
        type: "select",
        group: "Site status",
        options: YES_NO_UNSURE,
      },
      authority(["WASA", "DPHE", "City Corporation", "Pourashava", "Private"]),
    ],
  },
  {
    category: "Infrastructure",
    title: "Bridges, culverts & walls",
    description: "Bridges, culverts, retaining and boundary walls, embankments and foundations.",
    fields: [
      {
        key: "structureType",
        label: "Structure",
        type: "select",
        group: "Scope",
        required: true,
        options: [
          { value: "bridge", label: "Bridge", short: "Bridge" },
          { value: "culvert", label: "Culvert", short: "Culvert" },
          { value: "retaining_wall", label: "Retaining wall", short: "Retaining wall" },
          { value: "boundary_wall", label: "Boundary wall", short: "Boundary wall" },
          { value: "embankment", label: "Embankment or river protection", short: "Embankment" },
          { value: "foundation", label: "Tower or machine foundation", short: "Foundation" },
        ],
        summary: { order: 1 },
      },
      lengthM("Length", 2, "{value} m long"),
      {
        key: "heightM",
        label: "Height or span",
        type: "number",
        group: "Scope",
        unit: "m",
        min: 0.1,
        max: 1000,
        summary: { order: 3, template: "{value} m high/span" },
      },
      {
        key: "overWater",
        label: "Over water or flood-prone",
        type: "select",
        group: "Site status",
        options: YES_NO_UNSURE,
      },
      {
        key: "floodLevelKnown",
        label: "Highest flood level known",
        type: "select",
        group: "Site status",
        options: YES_NO,
      },
      { ...SOIL_TEST, summary: { order: 4 } },
      surveyAvailable,
      authority([
        "LGED",
        "RHD",
        "BWDB",
        "City Corporation",
        "Pourashava",
        "Union Parishad",
        "Private",
      ]),
    ],
  },
  {
    category: "Land development",
    title: "Land development",
    description: "Sand filling, excavation, levelling and slope protection.",
    fields: [
      {
        key: "workTypes",
        label: "What needs doing",
        type: "multi",
        group: "Scope",
        required: true,
        options: [
          { value: "filling", label: "Sand or land filling", short: "Land filling" },
          { value: "excavation", label: "Excavation", short: "Excavation" },
          { value: "levelling", label: "Levelling", short: "Levelling" },
          { value: "slope", label: "Slope protection", short: "Slope protection" },
        ],
        summary: { order: 1 },
      },
      { ...plotArea("Land area"), group: "Scope" },
      {
        key: "depthFt",
        label: "Depth to fill or cut",
        type: "number",
        group: "Scope",
        unit: "ft",
        min: 0.5,
        max: 200,
        summary: { order: 3, template: "{value} ft deep" },
      },
      {
        key: "currentLand",
        label: "The land now",
        type: "select",
        group: "Site status",
        options: [
          { value: "low_land", label: "Low land", short: "Low land" },
          { value: "pond", label: "Pond or ditch", short: "Pond" },
          { value: "agricultural", label: "Agricultural", short: "Farmland" },
          { value: "built", label: "Already built on", short: "Built-up" },
        ],
        summary: { order: 4 },
      },
      { ...SOIL_TEST, required: false, group: "Site status" },
    ],
  },
];

/** Services a client can ask for, whatever the project type. */
export const PROJECT_SERVICES: CriteriaOption[] = [
  { value: "structural_design", label: "Structural design" },
  { value: "architectural_design", label: "Architectural design" },
  { value: "soil_investigation", label: "Soil investigation" },
  { value: "survey", label: "Land or topographic survey" },
  { value: "estimation_boq", label: "Cost estimate & BOQ" },
  { value: "approval_drawings", label: "Approval drawings" },
  { value: "supervision", label: "Site supervision" },
  { value: "construction", label: "Construction" },
  { value: "renovation_repair", label: "Renovation & repair" },
  { value: "mep", label: "Electrical, plumbing & MEP" },
];

export const PROJECT_CATEGORIES = PROJECT_CRITERIA.map((entry) => entry.category);

export const findCategoryCriteria = (
  category: string,
): ProjectCategoryCriteria | null =>
  PROJECT_CRITERIA.find((entry) => entry.category === category) ?? null;

interface CriteriaError extends Error {
  statusCode: number;
}

const criteriaError = (message: string): CriteriaError => {
  const error = new Error(message) as CriteriaError;
  error.statusCode = 400;
  return error;
};

const isVisible = (
  field: CriteriaField,
  values: ProjectRequirements,
): boolean => {
  if (!field.showIf) return true;
  const controlling = values[field.showIf.key];
  if (Array.isArray(controlling)) {
    return controlling.some((value) => field.showIf?.in.includes(value));
  }
  return typeof controlling === "string" && field.showIf.in.includes(controlling);
};

const isBlank = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "") ||
  (Array.isArray(value) && value.length === 0);

const parseNumber = (field: CriteriaField, raw: unknown): number => {
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw criteriaError(`${field.label} must be a number.`);
  }
  if (field.integer && !Number.isInteger(value)) {
    throw criteriaError(`${field.label} must be a whole number.`);
  }
  if (field.min !== undefined && value < field.min) {
    throw criteriaError(`${field.label} must be at least ${field.min}.`);
  }
  if (field.max !== undefined && value > field.max) {
    throw criteriaError(`${field.label} must be at most ${field.max}.`);
  }
  return value;
};

const optionValues = (field: CriteriaField): string[] =>
  (field.options ?? []).map((option) => option.value);

const parseField = (field: CriteriaField, raw: unknown): RequirementValue => {
  switch (field.type) {
    case "number":
      return parseNumber(field, raw);
    case "area": {
      const area = raw as { value?: unknown; unit?: unknown } | null;
      if (typeof area !== "object" || area === null) {
        throw criteriaError(`${field.label} needs a size and a unit.`);
      }
      const unit = typeof area.unit === "string" ? area.unit : "";
      if (!(field.units ?? []).some((option) => option.value === unit)) {
        throw criteriaError(`Choose a unit for ${field.label.toLowerCase()}.`);
      }
      return { value: parseNumber(field, area.value), unit };
    }
    case "select": {
      if (typeof raw !== "string" || !optionValues(field).includes(raw)) {
        throw criteriaError(`Choose an option for ${field.label.toLowerCase()}.`);
      }
      return raw;
    }
    case "multi": {
      if (!Array.isArray(raw)) {
        throw criteriaError(`Choose options for ${field.label.toLowerCase()}.`);
      }
      const allowed = optionValues(field);
      const picked = [...new Set(raw)];
      if (!picked.every((value) => typeof value === "string" && allowed.includes(value))) {
        throw criteriaError(`Choose options for ${field.label.toLowerCase()}.`);
      }
      return picked as string[];
    }
    case "text": {
      if (typeof raw !== "string") {
        throw criteriaError(`${field.label} must be text.`);
      }
      const text = raw.trim();
      if (field.maxLength && text.length > field.maxLength) {
        throw criteriaError(
          `${field.label} must be ${field.maxLength} characters or fewer.`,
        );
      }
      return text;
    }
  }
};

/**
 * Checks a posted brief's requirements against its category and returns only
 * the fields that category asks, dropping unknown keys and fields hidden by
 * the client's other answers. Throws a 400 naming the first bad field.
 */
export const validateRequirements = (
  category: string,
  input: unknown,
): ProjectRequirements => {
  const criteria = findCategoryCriteria(category);
  if (!criteria) throw criteriaError("Choose a project category.");
  const raw =
    typeof input === "object" && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const values: ProjectRequirements = {};
  // Controlling fields come before the fields they reveal, so a single pass
  // sees each answer before it is needed.
  for (const field of criteria.fields) {
    if (!isVisible(field, values)) continue;
    const value = raw[field.key];
    if (isBlank(value)) {
      if (field.required) {
        throw criteriaError(`${field.label} is required.`);
      }
      continue;
    }
    values[field.key] = parseField(field, value);
  }
  return values;
};

const numberFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

const optionShort = (field: CriteriaField, value: string): string | null => {
  if (value === "not_sure" || value === "none") return null;
  const option = field.options?.find((entry) => entry.value === value);
  return option ? (option.short ?? option.label) : null;
};

const fillTemplate = (
  template: string,
  value: number,
  unit = "",
): string =>
  template
    .replace("{value}", numberFormat.format(value))
    .replace("{unit}", unit)
    .replace("{s}", value === 1 ? "" : "s");

const summariseField = (
  field: CriteriaField,
  value: RequirementValue,
): string | null => {
  if (typeof value === "number") {
    if (value === 0) return null;
    return fillTemplate(field.summary?.template ?? `{value} ${field.unit ?? ""}`.trim(), value);
  }
  if (typeof value === "string") return optionShort(field, value);
  if (Array.isArray(value)) {
    const labels = value
      .map((entry) => optionShort(field, entry))
      .filter((entry): entry is string => Boolean(entry));
    if (labels.length === 0) return null;
    return labels.length > 2
      ? `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`
      : labels.join(", ");
  }
  return fillTemplate(
    field.summary?.template ?? "{value} {unit}",
    value.value,
    areaUnitShort[value.unit] ?? value.unit,
  );
};

/** The brief card's one-line summary, e.g. "Apartment · 5 katha · 6 storeys". */
export const summariseRequirements = (
  category: string | undefined,
  requirements: ProjectRequirements | null | undefined,
  limit = 4,
): string | null => {
  const criteria = category ? findCategoryCriteria(category) : null;
  if (!criteria || !requirements) return null;
  const parts = criteria.fields
    .filter((field) => field.summary && requirements[field.key] !== undefined)
    .sort((a, b) => (a.summary?.order ?? 0) - (b.summary?.order ?? 0))
    .map((field) => summariseField(field, requirements[field.key]))
    .filter((part): part is string => Boolean(part))
    .slice(0, limit);
  return parts.length > 0 ? parts.join(" · ") : null;
};
