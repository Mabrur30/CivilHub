import {
  type ChangeEvent,
  type ReactElement,
  useEffect,
  useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

interface CityInfo {
  id: string;
  name: string;
  count: number;
  medianRate: number;
  meanRate: number;
}

interface ZoneInfo {
  name: string;
  count: number;
  medianRate: number;
}

interface CostEstimatorLocationsResponse {
  cities: CityInfo[];
  zones: Record<string, ZoneInfo[]>;
  standards: {
    materials_per_sqft: Record<string, any>;
    cost_breakdown_percentages: Record<string, any>;
    quality_tier_multipliers: Record<string, any>;
    building_type_multipliers: Record<string, any>;
  };
  modelMetrics: {
    r2Score: number;
    maeBDT: number;
    rmseBDT: number;
    modelAlgorithm: string;
    featureImportances: Record<string, number>;
  };
  datasetStats: {
    totalSamples: number;
    csvPath: string;
    overallMedianRateBDT: number;
  };
}

interface EstimationResult {
  inputs: {
    city: string;
    location: string;
    floorArea: number;
    floors: number;
    totalBuiltArea: number;
    bedrooms: number;
    bathrooms: number;
    qualityTier: "standard" | "premium" | "luxury";
    constructionType: string;
  };
  matchedLocation: string | null;
  dataConfidence: string;
  rates: {
    constructionRatePerSqFtBDT: number;
    marketRatePerSqFtBDT: number;
    cityMedianRateBDT: number;
  };
  constructionEstimate: {
    totalCostBDT: number;
    minCostBDT: number;
    maxCostBDT: number;
    tierName: string;
    tierTagline?: string;
    buildingTypeName: string;
  };
  marketValuation: {
    totalValuationBDT: number;
    minValuationBDT: number;
    maxValuationBDT: number;
  };
  breakdown: Array<{
    key: string;
    title: string;
    percentage: number;
    amountBDT: number;
    description: string;
  }>;
  materials: Array<{
    name: string;
    quantity: number;
    unit: string;
    approxUnitRateBDT: number;
    approxSubtotalBDT: number;
    specification: string;
  }>;
  timeline: {
    estimatedMonths: number;
    phases: Array<{
      phase: string;
      durationWeeks: number;
      activities: string;
    }>;
  };
  modelMeta: {
    algorithm: string;
    r2Score: number;
    samples: number;
  };
}

interface SavedEstimateRecord {
  _id: string;
  title: string;
  createdAt: string;
  inputs: EstimationResult["inputs"];
  constructionEstimate: EstimationResult["constructionEstimate"];
  marketValuation: EstimationResult["marketValuation"];
}

interface CostEstimatorPageProps {
  isStandalone?: boolean;
}

export function formatBDT(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return "৳ 0";
  return `৳ ${Math.round(amount).toLocaleString("en-US")}`;
}

export function formatBDTLakhCrore(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return "৳ 0";
  if (amount >= 10000000) {
    const crore = amount / 10000000;
    return `৳ ${crore.toFixed(2)} Crore`;
  }
  if (amount >= 100000) {
    const lakh = amount / 100000;
    return `৳ ${lakh.toFixed(2)} Lakh`;
  }
  return `৳ ${Math.round(amount).toLocaleString("en-US")}`;
}

export function CostEstimatorPage({
  isStandalone = false,
}: CostEstimatorPageProps): ReactElement {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // Form states
  const [city, setCity] = useState<string>("dhaka");
  const [location, setLocation] = useState<string>("Mirpur");
  const [floorArea, setFloorArea] = useState<number>(1400);
  const [floors, setFloors] = useState<number>(1);
  const [bedrooms, setBedrooms] = useState<number>(3);
  const [bathrooms, setBathrooms] = useState<number>(3);
  const [qualityTier, setQualityTier] = useState<"standard" | "premium" | "luxury">(
    "premium"
  );
  const [constructionType, setConstructionType] = useState<string>(
    "residential_apartment"
  );

  // Metadata & prediction results
  const [metaData, setMetaData] = useState<CostEstimatorLocationsResponse | null>(null);
  const [prediction, setPrediction] = useState<EstimationResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // Tabs & Views
  const [activeTab, setActiveTab] = useState<
    "breakdown" | "materials" | "timeline" | "market" | "saved"
  >("breakdown");

  // Save / History state
  const [savedEstimates, setSavedEstimates] = useState<SavedEstimateRecord[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<string>("");
  const [copyNotification, setCopyNotification] = useState<string>("");

  // Presets
  const applyPreset = (preset: {
    city: string;
    location: string;
    floorArea: number;
    floors: number;
    bedrooms: number;
    bathrooms: number;
    qualityTier: "standard" | "premium" | "luxury";
    constructionType: string;
  }): void => {
    setCity(preset.city);
    setLocation(preset.location);
    setFloorArea(preset.floorArea);
    setFloors(preset.floors);
    setBedrooms(preset.bedrooms);
    setBathrooms(preset.bathrooms);
    setQualityTier(preset.qualityTier);
    setConstructionType(preset.constructionType);
  };

  // Fetch initial meta and do default prediction
  useEffect(() => {
    let isMounted = true;
    const fetchMetadata = async (): Promise<void> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/cost-estimator/locations`);
        if (!res.ok) throw new Error("Failed to load estimator metadata");
        const data: CostEstimatorLocationsResponse = await res.json();
        if (isMounted) {
          setMetaData(data);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || "Failed to load estimator locations");
      }
    };

    fetchMetadata();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch saved history if user is logged in
  const fetchSavedEstimates = async (): Promise<void> => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/cost-estimator/history`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setSavedEstimates(data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchSavedEstimates();
  }, [currentUser]);

  // Execute prediction
  const handleCalculate = async (e?: React.FormEvent): Promise<void> => {
    if (e) e.preventDefault();
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${API_BASE_URL}/api/cost-estimator/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          city,
          location,
          floorArea,
          floors,
          bedrooms,
          bathrooms,
          qualityTier,
          constructionType,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to predict building cost");
      }

      const result: EstimationResult = await res.json();
      setPrediction(result);
    } catch (err: any) {
      setError(err.message || "An error occurred during calculation");
    } finally {
      setLoading(false);
    }
  };

  // Run initial calculation when meta finishes loading or on initial mount
  useEffect(() => {
    handleCalculate();
  }, []);

  // Save estimate
  const handleSaveEstimate = async (): Promise<void> => {
    if (!prediction) return;
    try {
      setSaving(true);
      setSaveSuccess("");
      const title = `${floors}-Story ${
        constructionType === "duplex"
          ? "Duplex"
          : constructionType === "independent_house"
          ? "House"
          : "Building"
      } in ${location || city}`;

      const res = await fetch(`${API_BASE_URL}/api/cost-estimator/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title,
          ...prediction,
        }),
      });

      if (!res.ok) {
        throw new Error("Unable to save estimate");
      }

      setSaveSuccess("Estimate saved successfully!");
      fetchSavedEstimates();
      setTimeout(() => setSaveSuccess(""), 4000);
    } catch (err: any) {
      setError(err.message || "Failed to save estimate");
    } finally {
      setSaving(false);
    }
  };

  // Post project pre-fill
  const handlePostProject = (): void => {
    if (!prediction) return;
    const est = prediction.constructionEstimate;
    const inData = prediction.inputs;

    const prefillTitle = `Construction of ${inData.floors}-Story ${
      inData.constructionType === "duplex"
        ? "Duplex Residence"
        : inData.constructionType === "independent_house"
        ? "Independent House"
        : "Apartment Building"
    } (${inData.totalBuiltArea.toLocaleString()} sq.ft)`;

    const prefillDescription = `Looking for an experienced structural & civil engineer for our upcoming ${
      inData.floors
    }-story construction project in ${inData.location || inData.city}.
Built-up Area: ${inData.totalBuiltArea.toLocaleString()} sq. ft (${inData.floorArea} sq.ft × ${inData.floors} floors)
Quality Tier: ${est.tierName}
Estimated Construction Budget: ${formatBDTLakhCrore(
      est.totalCostBDT
    )} (${formatBDT(est.minCostBDT)} - ${formatBDT(est.maxCostBDT)})
Key Estimated Materials:
- Cement: ~${prediction.materials.find((m) => m.name.includes("Cement"))?.quantity} bags
- Steel Rebar: ~${prediction.materials.find((m) => m.name.includes("Steel"))?.quantity} tons
- Auto Bricks: ~${prediction.materials.find((m) => m.name.includes("Bricks"))?.quantity} pcs
Estimated Duration: ~${prediction.timeline.estimatedMonths} months. Please submit detailed work proposals and engineering qualifications.`;

    const targetRoute =
      currentUser?.role === "client"
        ? "/dashboard/client/post-project"
        : "/signup/client";

    navigate(targetRoute, {
      state: {
        title: prefillTitle,
        description: prefillDescription,
        category: "Residential",
        budgetMin: String(est.minCostBDT),
        budgetMax: String(est.maxCostBDT),
        location: `${inData.location ? `${inData.location}, ` : ""}${
          inData.city.charAt(0).toUpperCase() + inData.city.slice(1)
        }`,
      },
    });
  };

  // Copy Summary to clipboard
  const handleCopySummary = (): void => {
    if (!prediction) return;
    const text = `=== CivilHub Construction Cost Estimate ===
Location: ${prediction.inputs.location || prediction.inputs.city} (${prediction.inputs.city})
Built-up Area: ${prediction.inputs.totalBuiltArea.toLocaleString()} sq.ft (${prediction.inputs.floors} floors × ${prediction.inputs.floorArea} sq.ft)
Tier: ${prediction.constructionEstimate.tierName}
Estimated Construction Cost: ${formatBDTLakhCrore(prediction.constructionEstimate.totalCostBDT)} (${formatBDT(prediction.constructionEstimate.minCostBDT)} - ${formatBDT(prediction.constructionEstimate.maxCostBDT)})
Rate per sq.ft: ৳ ${prediction.rates.constructionRatePerSqFtBDT} / sq.ft
Estimated Property Market Valuation: ${formatBDTLakhCrore(prediction.marketValuation.totalValuationBDT)}
Estimated Timeline: ~${prediction.timeline.estimatedMonths} months
Generated via CivilHub AI & BNBC Construction Model`;

    navigator.clipboard.writeText(text);
    setCopyNotification("Summary copied to clipboard!");
    setTimeout(() => setCopyNotification(""), 3000);
  };

  const totalBuiltSqFt = floorArea * floors;
  const currentZones = metaData?.zones?.[city] || [];

  return (
    <div className="space-y-10 pb-16">
      {/* Standalone Top Bar if accessed without dashboard layout */}
      {isStandalone ? (
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/60 bg-primary/10 text-sm font-bold text-primary">
              C
            </span>
            <span className="font-heading text-2xl font-bold tracking-tight text-white">
              CivilHub
            </span>
          </Link>
          <div className="flex items-center gap-3">
            {currentUser ? (
              <button
                type="button"
                onClick={() => navigate(`/dashboard/${currentUser.role}`)}
                className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-primary"
              >
                Go to Dashboard
              </button>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-primary hover:text-primary"
                >
                  Log In
                </Link>
                <Link
                  to="/signup/client"
                  className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-glow"
                >
                  Join CivilHub
                </Link>
              </>
            )}
          </div>
        </header>
      ) : null}

      {/* Hero / Header Section */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-surface via-surface/90 to-muted/20 p-6 sm:p-10">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            AI & Civil Engineering Construction Model
          </div>
          <h1 className="mt-4 font-heading text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            House & Building Cost Estimator
          </h1>
          <p className="mt-3 text-base text-white/70 sm:text-lg leading-relaxed">
            Predict accurate construction budgets, structural material requirements
            (cement, rod, sand, aggregate, bricks), and property market valuations based
            on 3,750+ verified Bangladesh property listings and BNBC civil engineering
            standards.
          </p>

          {/* Quick Preset Buttons */}
          <div className="mt-6 flex flex-wrap items-center gap-2 pt-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/40 mr-1">
              Quick Scenarios:
            </span>
            <button
              type="button"
              onClick={() =>
                applyPreset({
                  city: "dhaka",
                  location: "Mirpur",
                  floorArea: 1400,
                  floors: 1,
                  bedrooms: 3,
                  bathrooms: 3,
                  qualityTier: "standard",
                  constructionType: "residential_apartment",
                })
              }
              className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80 transition hover:border-primary hover:text-white hover:bg-white/10"
            >
              Standard Flat (1,400 sq.ft)
            </button>
            <button
              type="button"
              onClick={() =>
                applyPreset({
                  city: "dhaka",
                  location: "Bashundhara",
                  floorArea: 2200,
                  floors: 2,
                  bedrooms: 4,
                  bathrooms: 4,
                  qualityTier: "premium",
                  constructionType: "duplex",
                })
              }
              className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80 transition hover:border-primary hover:text-white hover:bg-white/10"
            >
              Duplex Home (4,400 sq.ft)
            </button>
            <button
              type="button"
              onClick={() =>
                applyPreset({
                  city: "dhaka",
                  location: "Uttara",
                  floorArea: 1800,
                  floors: 6,
                  bedrooms: 3,
                  bathrooms: 3,
                  qualityTier: "premium",
                  constructionType: "residential_apartment",
                })
              }
              className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80 transition hover:border-primary hover:text-white hover:bg-white/10"
            >
              6-Story G+5 Building (10,800 sq.ft)
            </button>
            <button
              type="button"
              onClick={() =>
                applyPreset({
                  city: "chattogram",
                  location: "Khulshi",
                  floorArea: 3000,
                  floors: 3,
                  bedrooms: 5,
                  bathrooms: 5,
                  qualityTier: "luxury",
                  constructionType: "independent_house",
                })
              }
              className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80 transition hover:border-primary hover:text-white hover:bg-white/10"
            >
              Luxury Residence (9,000 sq.ft)
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {copyNotification ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl border border-primary/40 bg-void px-5 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur-md">
          ✓ {copyNotification}
        </div>
      ) : null}

      {saveSuccess ? (
        <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-300">
          ✓ {saveSuccess}
        </div>
      ) : null}

      {/* Main Grid: Left Controls, Right Predictions */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Estimator Input Controls (5 cols) */}
        <div className="lg:col-span-5">
          <form
            onSubmit={handleCalculate}
            className="sticky top-24 space-y-6 rounded-3xl border border-white/10 bg-surface/90 p-6 shadow-xl backdrop-blur-md sm:p-7"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="font-heading text-xl font-bold text-white">
                  Building Specs
                </h2>
                <p className="text-xs text-white/60">
                  Configure area, location & materials
                </p>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                {totalBuiltSqFt.toLocaleString()} sq.ft Total
              </span>
            </div>

            {/* City & Location */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-white/70 mb-1.5">
                  City / Region
                </label>
                <select
                  value={city}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    const newCity = e.target.value;
                    setCity(newCity);
                    const zones = metaData?.zones?.[newCity] || [];
                    if (zones.length > 0) {
                      setLocation(zones[0].name);
                    } else {
                      setLocation("");
                    }
                  }}
                  className="form-input text-sm"
                >
                  <option value="dhaka">Dhaka (Capital Division)</option>
                  <option value="chattogram">Chattogram (Chittagong)</option>
                  <option value="gazipur">Gazipur</option>
                  <option value="narayanganj-city">Narayanganj City</option>
                  <option value="cumilla">Cumilla</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-white/70 mb-1.5">
                  Specific Area / Neighborhood
                </label>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    list="location-suggestions"
                    value={location}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setLocation(e.target.value)
                    }
                    placeholder="e.g. Mirpur, Gulshan, Uttara, Khulshi..."
                    className="form-input text-sm"
                  />
                  <datalist id="location-suggestions">
                    {currentZones.map((z) => (
                      <option key={z.name} value={z.name}>
                        {z.name} (Avg ৳{z.medianRate.toLocaleString()}/sq.ft)
                      </option>
                    ))}
                  </datalist>
                  <p className="text-[11px] text-white/40">
                    Matches local real estate price premiums from {metaData?.datasetStats?.totalSamples || 3750}+ listings.
                  </p>
                </div>
              </div>
            </div>

            {/* Building Type */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-white/70 mb-1.5">
                Building Architecture Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    id: "residential_apartment",
                    label: "Apartment Building",
                    icon: "🏢",
                  },
                  {
                    id: "independent_house",
                    label: "Family House",
                    icon: "🏡",
                  },
                  { id: "duplex", label: "Duplex Villa", icon: "🏛️" },
                  {
                    id: "commercial_space",
                    label: "Commercial Space",
                    icon: "🏬",
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setConstructionType(item.id)}
                    className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-semibold transition ${
                      constructionType === item.id
                        ? "border-primary bg-primary/10 text-white"
                        : "border-white/10 bg-void/50 text-white/70 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quality Tier */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-white/70 mb-1.5">
                Construction Quality & Finishing Grade
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    id: "standard",
                    title: "Standard",
                    rate: "~৳2,400/sqft",
                    desc: "Local brand tiles, standard rebar & fittings",
                  },
                  {
                    id: "premium",
                    title: "Premium",
                    rate: "~৳3,150/sqft",
                    desc: "BSRM steel, Shah cement, RAK tiles, brand MEP",
                  },
                  {
                    id: "luxury",
                    title: "Luxury",
                    rate: "~৳4,200/sqft",
                    desc: "Imported marble, smart automation, luxury fittings",
                  },
                ].map((tier) => (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() =>
                      setQualityTier(tier.id as "standard" | "premium" | "luxury")
                    }
                    className={`flex flex-col rounded-xl border p-2.5 text-left transition ${
                      qualityTier === tier.id
                        ? "border-primary bg-primary/10 text-white"
                        : "border-white/10 bg-void/50 text-white/70 hover:border-white/20"
                    }`}
                  >
                    <span className="text-xs font-bold text-white">
                      {tier.title}
                    </span>
                    <span className="text-[11px] font-semibold text-primary mt-0.5">
                      {tier.rate}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Area & Stories Sliders */}
            <div className="space-y-4 rounded-2xl border border-white/10 bg-void/40 p-4">
              <div>
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-white/70">Floor Area per Story</span>
                  <span className="font-bold text-white">
                    {floorArea.toLocaleString()} sq.ft
                  </span>
                </div>
                <input
                  type="range"
                  min="400"
                  max="6000"
                  step="50"
                  value={floorArea}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setFloorArea(Number(e.target.value))
                  }
                  className="mt-2 w-full accent-primary cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-white/70">Number of Stories / Floors</span>
                  <span className="font-bold text-white">
                    {floors} {floors === 1 ? "Story (Ground)" : `Stories (G+${floors - 1})`}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="15"
                  step="1"
                  value={floors}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setFloors(Number(e.target.value))
                  }
                  className="mt-2 w-full accent-primary cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-white/60 mb-1">
                    Bedrooms / Units
                  </label>
                  <select
                    value={bedrooms}
                    onChange={(e) => setBedrooms(Number(e.target.value))}
                    className="form-input py-1.5 text-xs"
                  >
                    {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20].map((num) => (
                      <option key={num} value={num}>
                        {num} {num === 1 ? "Bed / Unit" : "Beds / Units"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-white/60 mb-1">
                    Bathrooms
                  </label>
                  <select
                    value={bathrooms}
                    onChange={(e) => setBathrooms(Number(e.target.value))}
                    className="form-input py-1.5 text-xs"
                  >
                    {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20].map((num) => (
                      <option key={num} value={num}>
                        {num} {num === 1 ? "Bathroom" : "Bathrooms"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Calculate Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-primary py-3.5 text-sm font-bold text-white shadow-glow transition-all duration-300 hover:bg-glow hover:-translate-y-0.5 disabled:opacity-50"
            >
              {loading ? "Calculating Estimates..." : "Update Cost Estimate"}
            </button>
          </form>
        </div>

        {/* Right Column: Calculations & Interactive Breakdowns (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {prediction ? (
            <>
              {/* Top Summary Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Construction Cost Card */}
                <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-surface to-muted/25 p-6 shadow-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                      Total Construction Cost
                    </span>
                    <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                      Civil BOQ
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="font-heading text-3xl font-extrabold text-white sm:text-4xl">
                      {formatBDTLakhCrore(
                        prediction.constructionEstimate.totalCostBDT
                      )}
                    </div>
                    <div className="mt-1 text-xs text-white/60 font-medium">
                      Exact: {formatBDT(prediction.constructionEstimate.totalCostBDT)}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs">
                    <span className="text-white/60">Estimated Rate:</span>
                    <span className="font-bold text-white">
                      ৳ {prediction.rates.constructionRatePerSqFtBDT.toLocaleString()} / sq.ft
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-white/60">Confidence Range:</span>
                    <span className="text-white/80">
                      {formatBDTLakhCrore(prediction.constructionEstimate.minCostBDT)} –{" "}
                      {formatBDTLakhCrore(prediction.constructionEstimate.maxCostBDT)}
                    </span>
                  </div>
                </div>

                {/* Property Market Valuation Card */}
                <div className="rounded-3xl border border-white/10 bg-surface/90 p-6 shadow-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
                      Market Property Valuation
                    </span>
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white/80">
                      Land + Structure
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="font-heading text-3xl font-extrabold text-white sm:text-4xl">
                      {formatBDTLakhCrore(
                        prediction.marketValuation.totalValuationBDT
                      )}
                    </div>
                    <div className="mt-1 text-xs text-white/60 font-medium">
                      Exact: {formatBDT(prediction.marketValuation.totalValuationBDT)}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs">
                    <span className="text-white/60">Location Rate:</span>
                    <span className="font-bold text-white">
                      ৳ {prediction.rates.marketRatePerSqFtBDT.toLocaleString()} / sq.ft
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-white/60">Location Match:</span>
                    <span className="text-primary font-medium">
                      {prediction.matchedLocation || prediction.inputs.city} ({prediction.dataConfidence})
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-surface/60 p-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveEstimate}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white transition hover:border-primary hover:text-primary hover:bg-white/10 disabled:opacity-50"
                  >
                    <span>💾</span>
                    <span>{saving ? "Saving..." : "Save to History"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopySummary}
                    className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
                  >
                    <span>📋</span>
                    <span>Copy Summary</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="hidden sm:flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
                  >
                    <span>🖨️</span>
                    <span>Print PDF</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handlePostProject}
                  className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-glow transition hover:bg-glow"
                >
                  <span>🚀</span>
                  <span>Post Project with this Estimate</span>
                </button>
              </div>

              {/* Detail Tabs */}
              <div className="rounded-3xl border border-white/10 bg-surface/90 overflow-hidden shadow-xl">
                <div className="flex border-b border-white/10 overflow-x-auto bg-surface">
                  {[
                    { id: "breakdown", label: "Cost Breakdown", icon: "📊" },
                    { id: "materials", label: "Materials (BOQ)", icon: "🏗️" },
                    { id: "timeline", label: "Timeline & Schedule", icon: "📅" },
                    { id: "market", label: "Market Insights", icon: "📈" },
                    {
                      id: "saved",
                      label: `Saved (${savedEstimates.length})`,
                      icon: "📁",
                    },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-2 px-5 py-3.5 text-xs font-bold transition whitespace-nowrap border-b-2 ${
                        activeTab === tab.id
                          ? "border-primary bg-primary/10 text-white"
                          : "border-transparent text-white/50 hover:text-white"
                      }`}
                    >
                      <span>{tab.icon}</span>
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>

                <div className="p-6">
                  {/* TAB 1: Breakdown */}
                  {activeTab === "breakdown" ? (
                    <div className="space-y-5">
                      <div className="flex items-center justify-between text-xs text-white/60">
                        <span>Category Breakdown according to BNBC Standards</span>
                        <span>Total: {formatBDT(prediction.constructionEstimate.totalCostBDT)}</span>
                      </div>

                      <div className="space-y-4">
                        {prediction.breakdown.map((item) => (
                          <div
                            key={item.key}
                            className="rounded-2xl border border-white/5 bg-void/40 p-4 transition hover:border-white/15"
                          >
                            <div className="flex items-center justify-between text-sm font-semibold text-white">
                              <span>{item.title}</span>
                              <span className="text-primary font-bold">
                                {formatBDT(item.amountBDT)} ({item.percentage}%)
                              </span>
                            </div>

                            {/* Progress bar */}
                            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-primary to-glow"
                                style={{ width: `${item.percentage * 2.5}%` }}
                              />
                            </div>

                            <p className="mt-2 text-xs text-white/50">
                              {item.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* TAB 2: Materials (BOQ) */}
                  {activeTab === "materials" ? (
                    <div className="space-y-5">
                      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs text-white/80 leading-relaxed">
                        <span className="font-bold text-primary">Civil Engineering Thumb-rules: </span>
                        Quantities are calculated based on {prediction.inputs.totalBuiltArea.toLocaleString()} sq. ft total built-up slab area using standard structural coefficients (0.4 bags cement/sqft, ~3.85 kg rebar/sqft, ~19.5 auto bricks/sqft).
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-white">
                          <thead>
                            <tr className="border-b border-white/10 text-white/50 uppercase tracking-wider text-[11px]">
                              <th className="pb-3">Material Item</th>
                              <th className="pb-3">Est. Quantity</th>
                              <th className="pb-3">Unit Price (BDT)</th>
                              <th className="pb-3 text-right">Subtotal (BDT)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {prediction.materials.map((mat) => (
                              <tr key={mat.name} className="hover:bg-white/[0.02]">
                                <td className="py-3 font-semibold">
                                  <div>{mat.name}</div>
                                  <div className="text-[10px] text-white/45">
                                    {mat.specification}
                                  </div>
                                </td>
                                <td className="py-3 font-bold text-white">
                                  {mat.quantity.toLocaleString()} {mat.unit}
                                </td>
                                <td className="py-3 text-white/70">
                                  ৳ {mat.approxUnitRateBDT.toLocaleString()}
                                </td>
                                <td className="py-3 font-bold text-primary text-right">
                                  {formatBDT(mat.approxSubtotalBDT)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  {/* TAB 3: Timeline */}
                  {activeTab === "timeline" ? (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between border-b border-white/10 pb-4">
                        <div>
                          <div className="text-sm font-bold text-white">
                            Estimated Project Duration
                          </div>
                          <div className="text-xs text-white/50">
                            Based on {prediction.inputs.floors} floors & structural complexity
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-heading text-2xl font-bold text-primary">
                            ~{prediction.timeline.estimatedMonths} Months
                          </span>
                        </div>
                      </div>

                      <div className="relative space-y-4 pl-6 before:absolute before:bottom-2 before:left-2 before:top-2 before:w-0.5 before:bg-white/10">
                        {prediction.timeline.phases.map((ph, idx) => (
                          <div key={ph.phase} className="relative group">
                            <span className="absolute -left-6 top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-primary bg-void text-[9px] font-bold text-primary">
                              {idx + 1}
                            </span>
                            <div className="rounded-2xl border border-white/5 bg-void/40 p-4">
                              <div className="flex items-center justify-between text-xs font-bold text-white">
                                <span>{ph.phase}</span>
                                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary text-[10px]">
                                  {ph.durationWeeks} Weeks
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-white/50">
                                {ph.activities}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* TAB 4: Market Insights */}
                  {activeTab === "market" ? (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="rounded-2xl border border-white/5 bg-void/40 p-4">
                          <div className="text-xs text-white/60">
                            City Median Price Rate
                          </div>
                          <div className="mt-1 text-xl font-bold text-white">
                            ৳ {prediction.rates.cityMedianRateBDT.toLocaleString()} / sq.ft
                          </div>
                          <div className="mt-1 text-[11px] text-white/40">
                            Median of {prediction.inputs.city} listings
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/5 bg-void/40 p-4">
                          <div className="text-xs text-white/60">
                            Neighborhood Rate ({prediction.matchedLocation || prediction.inputs.location})
                          </div>
                          <div className="mt-1 text-xl font-bold text-primary">
                            ৳ {prediction.rates.marketRatePerSqFtBDT.toLocaleString()} / sq.ft
                          </div>
                          <div className="mt-1 text-[11px] text-white/40">
                            {prediction.dataConfidence}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/5 bg-void/40 p-4 text-xs space-y-2">
                        <div className="font-bold text-white">
                          Model Architecture & Dataset
                        </div>
                        <div className="text-white/60 leading-relaxed">
                          Trained on <span className="text-white font-semibold">{prediction.modelMeta.samples} property listings</span> across Dhaka, Chattogram, Gazipur, Narayanganj, and Cumilla using <span className="text-primary font-semibold">{prediction.modelMeta.algorithm}</span> with an R² validation score of <span className="text-white font-semibold">{(prediction.modelMeta.r2Score * 100).toFixed(1)}%</span>.
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* TAB 5: Saved History */}
                  {activeTab === "saved" ? (
                    <div className="space-y-4">
                      {savedEstimates.length === 0 ? (
                        <div className="py-12 text-center text-white/40 text-xs">
                          No saved estimates found. Click &quot;Save to History&quot; above to store this estimation!
                        </div>
                      ) : (
                        savedEstimates.map((saved) => (
                          <div
                            key={saved._id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-white/10 bg-void/40 p-4 transition hover:border-white/20"
                          >
                            <div>
                              <div className="text-sm font-bold text-white">
                                {saved.title}
                              </div>
                              <div className="mt-0.5 text-xs text-white/50">
                                {saved.inputs.totalBuiltArea.toLocaleString()} sq.ft • {saved.inputs.floors} floors • {saved.inputs.city}
                              </div>
                              <div className="mt-1 text-[11px] text-white/40">
                                Saved on {new Date(saved.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="text-right flex sm:flex-col items-center sm:items-end justify-between">
                              <div className="font-bold text-primary text-sm">
                                {formatBDTLakhCrore(saved.constructionEstimate.totalCostBDT)}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setCity(saved.inputs.city);
                                  setLocation(saved.inputs.location || "");
                                  setFloorArea(saved.inputs.floorArea);
                                  setFloors(saved.inputs.floors);
                                  setBedrooms(saved.inputs.bedrooms);
                                  setBathrooms(saved.inputs.bathrooms);
                                  setQualityTier(saved.inputs.qualityTier);
                                  setConstructionType(saved.inputs.constructionType);
                                  setActiveTab("breakdown");
                                }}
                                className="mt-1 text-xs font-semibold text-white/70 underline hover:text-white"
                              >
                                Load Parameters
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-surface/50 p-12 text-center text-white/40">
              Loading prediction...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CostEstimatorPage;
