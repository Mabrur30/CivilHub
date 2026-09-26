import {
  PROJECT_CRITERIA,
  summariseRequirements,
  validateRequirements,
} from "../utils/projectCriteria";

const validByCategory: Record<string, Record<string, unknown>> = {
  Residential: {
    buildingType: "apartment",
    plotArea: { value: 5, unit: "katha" },
    storeys: 6,
    basements: 1,
    flatsPerFloor: 2,
    soilTest: "done",
    approval: "applied",
    approvalAuthority: "rajuk",
  },
  Commercial: {
    occupancy: "industrial",
    plotArea: { value: 2, unit: "bigha" },
    storeys: 3,
    specialLoads: ["crane"],
    soilTest: "not_done",
    approval: "not_applied",
  },
  Renovation: {
    workTypes: ["add_floors", "waterproofing"],
    existingStoreys: 4,
    storeysToAdd: 2,
    existingDrawings: "partly",
  },
  "Roads & transport": {
    workType: "new",
    lengthM: 850,
    widthM: 6,
    pavement: "rcc",
    traffic: "heavy",
  },
  "Water & drainage": {
    systems: ["tank", "tube_well"],
    tankCapacity: 20000,
  },
  Infrastructure: {
    structureType: "retaining_wall",
    lengthM: 40,
    heightM: 3,
    soilTest: "not_sure",
  },
  "Land development": {
    workTypes: ["filling"],
    plotArea: { value: 30, unit: "decimal" },
    depthFt: 6,
  },
};

describe("project criteria", () => {
  test("every category has a valid sample and a required field", () => {
    for (const entry of PROJECT_CRITERIA) {
      expect(validByCategory[entry.category]).toBeDefined();
      expect(entry.fields.some((field) => field.required)).toBe(true);
    }
  });

  test.each(PROJECT_CRITERIA.map((entry) => entry.category))(
    "%s accepts a valid brief and names a missing required field",
    (category) => {
      const valid = validByCategory[category];
      expect(validateRequirements(category, valid)).toMatchObject(valid);

      const criteria = PROJECT_CRITERIA.find((entry) => entry.category === category);
      const required = criteria?.fields.find((field) => field.required);
      const missing = { ...valid };
      delete missing[required?.key ?? ""];
      expect(() => validateRequirements(category, missing)).toThrow(
        `${required?.label} is required.`,
      );
    },
  );

  test("rejects unknown options, negative numbers and fractional counts", () => {
    const base = validByCategory.Residential;
    expect(() =>
      validateRequirements("Residential", { ...base, buildingType: "castle" }),
    ).toThrow(/type of building/i);
    expect(() =>
      validateRequirements("Residential", { ...base, basements: -1 }),
    ).toThrow(/at least 0/);
    expect(() =>
      validateRequirements("Residential", { ...base, storeys: 2.5 }),
    ).toThrow(/whole number/);
    expect(() =>
      validateRequirements("Residential", {
        ...base,
        plotArea: { value: 5, unit: "acre" },
      }),
    ).toThrow(/unit/);
  });

  test("drops unknown keys and answers to questions that were not asked", () => {
    const cleaned = validateRequirements("Residential", {
      ...validByCategory.Residential,
      buildingType: "duplex",
      flatsPerFloor: 4,
      approval: "not_applied",
      approvalAuthority: "rajuk",
      shoeSize: 42,
    });
    expect(cleaned).not.toHaveProperty("flatsPerFloor");
    expect(cleaned).not.toHaveProperty("approvalAuthority");
    expect(cleaned).not.toHaveProperty("shoeSize");
  });

  test("accepts numbers typed as text", () => {
    expect(
      validateRequirements("Roads & transport", {
        ...validByCategory["Roads & transport"],
        lengthM: "1200",
      }).lengthM,
    ).toBe(1200);
  });

  test("rejects an unknown category", () => {
    expect(() => validateRequirements("Spaceport", {})).toThrow(/category/);
  });

  test("summarises the key facts for the brief card", () => {
    expect(
      summariseRequirements(
        "Residential",
        validateRequirements("Residential", validByCategory.Residential),
      ),
    ).toBe("Apartment · 5 katha · 6 storeys · Soil test done");
    expect(
      summariseRequirements(
        "Roads & transport",
        validateRequirements("Roads & transport", validByCategory["Roads & transport"]),
      ),
    ).toBe("New road · 850 m long · 6 m wide · RCC");
    expect(
      summariseRequirements(
        "Renovation",
        validateRequirements("Renovation", validByCategory.Renovation),
      ),
    ).toBe("Adding floors, Waterproofing · 4-storey building · +2 storeys · Partial drawings");
    expect(summariseRequirements("Residential", null)).toBeNull();
  });
});
