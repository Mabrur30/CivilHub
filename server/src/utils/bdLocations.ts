/** Bangladesh's 64 districts by division, as the site picker offers them. */
export const BD_DIVISIONS: Record<string, string[]> = {
  Barishal: ["Barguna", "Barishal", "Bhola", "Jhalokati", "Patuakhali", "Pirojpur"],
  Chattogram: [
    "Bandarban",
    "Brahmanbaria",
    "Chandpur",
    "Chattogram",
    "Cox's Bazar",
    "Cumilla",
    "Feni",
    "Khagrachhari",
    "Lakshmipur",
    "Noakhali",
    "Rangamati",
  ],
  Dhaka: [
    "Dhaka",
    "Faridpur",
    "Gazipur",
    "Gopalganj",
    "Kishoreganj",
    "Madaripur",
    "Manikganj",
    "Munshiganj",
    "Narayanganj",
    "Narsingdi",
    "Rajbari",
    "Shariatpur",
    "Tangail",
  ],
  Khulna: [
    "Bagerhat",
    "Chuadanga",
    "Jashore",
    "Jhenaidah",
    "Khulna",
    "Kushtia",
    "Magura",
    "Meherpur",
    "Narail",
    "Satkhira",
  ],
  Mymensingh: ["Jamalpur", "Mymensingh", "Netrokona", "Sherpur"],
  Rajshahi: [
    "Bogura",
    "Chapai Nawabganj",
    "Joypurhat",
    "Naogaon",
    "Natore",
    "Pabna",
    "Rajshahi",
    "Sirajganj",
  ],
  Rangpur: [
    "Dinajpur",
    "Gaibandha",
    "Kurigram",
    "Lalmonirhat",
    "Nilphamari",
    "Panchagarh",
    "Rangpur",
    "Thakurgaon",
  ],
  Sylhet: ["Habiganj", "Moulvibazar", "Sunamganj", "Sylhet"],
};

export interface BdDistrict {
  name: string;
  division: string;
}

export const BD_DISTRICTS: BdDistrict[] = Object.entries(BD_DIVISIONS)
  .flatMap(([division, names]) => names.map((name) => ({ name, division })))
  .sort((a, b) => a.name.localeCompare(b.name));

// Older English spellings still common on maps, in documents and in people's
// own typing.
const ALIASES: Record<string, string> = {
  barisal: "Barishal",
  chittagong: "Chattogram",
  comilla: "Cumilla",
  jessore: "Jashore",
  bogra: "Bogura",
  chapainawabganj: "Chapai Nawabganj",
  nawabganj: "Chapai Nawabganj",
  maulvibazar: "Moulvibazar",
  netrakona: "Netrokona",
  jhalakati: "Jhalokati",
  jhalokathi: "Jhalokati",
  khagrachari: "Khagrachhari",
  laxmipur: "Lakshmipur",
  lakshmipur: "Lakshmipur",
  hobiganj: "Habiganj",
  kishorganj: "Kishoreganj",
  coxsbazar: "Cox's Bazar",
};

const normalise = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\b(district|zila|zilla|city corporation|division|sadar)\b/g, "")
    .replace(/[^a-z]/g, "");

const byNormalisedName = new Map(
  BD_DISTRICTS.map((district) => [normalise(district.name), district]),
);

/** Matches "Dhaka District", "Chittagong" or "cox's bazar" to a district. */
export const findDistrict = (
  name: string | null | undefined,
): BdDistrict | null => {
  if (!name) return null;
  const key = normalise(name);
  if (!key) return null;
  const direct = byNormalisedName.get(key);
  if (direct) return direct;
  const alias = ALIASES[key];
  return alias ? (byNormalisedName.get(normalise(alias)) ?? null) : null;
};
