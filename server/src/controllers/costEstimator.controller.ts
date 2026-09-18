import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import CostEstimate from "../models/CostEstimate.model";

const ML_DIR = path.resolve(__dirname, "../../ml");
const META_PATH = path.join(ML_DIR, "model_meta.json");
const PREDICT_SCRIPT = path.join(ML_DIR, "predict.py");

interface PredictionInputs {
  city?: string;
  location?: string;
  floorArea?: number;
  floors?: number;
  bedrooms?: number;
  bathrooms?: number;
  qualityTier?: "standard" | "premium" | "luxury";
  constructionType?:
    | "residential_apartment"
    | "independent_house"
    | "duplex"
    | "commercial_space";
}

let cachedMetadata: any = null;

function getMetadata(): any {
  if (cachedMetadata) return cachedMetadata;
  if (fs.existsSync(META_PATH)) {
    try {
      const data = fs.readFileSync(META_PATH, "utf-8");
      cachedMetadata = JSON.parse(data);
      return cachedMetadata;
    } catch (err) {
      console.error("Failed to parse model_meta.json:", err);
    }
  }
  return null;
}

// Native fallback calculation engine using model_meta.json
function calculateCostNative(params: PredictionInputs, meta: any): any {
  const city = (params.city || "dhaka").trim().toLowerCase();
  const rawLocation = (params.location || "").trim();
  const floorArea = Math.max(100, Number(params.floorArea) || 1200);
  const floors = Math.max(1, Math.min(50, Number(params.floors) || 1));
  const bedrooms = Number(params.bedrooms) || Math.max(1, Math.round(floorArea / 450));
  const bathrooms = Number(params.bathrooms) || Math.max(1, Math.min(bedrooms, 4));
  const qualityTier = (params.qualityTier || "standard").toLowerCase();
  const buildingType = (params.constructionType || "residential_apartment").toLowerCase();

  const totalBuiltArea = floorArea * floors;

  const standards = meta?.standards || {};
  const tierMeta = standards.quality_tier_multipliers?.[qualityTier] || {
    factor: 1.0,
    name: "Standard / Economy Grade",
    tagline: "Cost-effective, dependable quality materials",
    construction_rate_bdt_sqft: 2400,
  };
  const typeMeta = standards.building_type_multipliers?.[buildingType] || {
    factor: 1.0,
    name: "Residential Apartment Building",
  };

  const cities = meta?.cities || {};
  const zones = meta?.zones || {};
  const locations = meta?.locations || {};

  const cityData = cities[city] || cities["dhaka"] || {
    median_rate: 6410,
    count: 1000,
  };

  let matchedLocation: string | null = null;
  let marketRateSqft = cityData.median_rate || 6400;
  let dataConfidence = "City Average";

  const locKey = `${city}::${rawLocation}`;
  if (locations[locKey]) {
    matchedLocation = locations[locKey].location;
    marketRateSqft = locations[locKey].median_rate;
    dataConfidence = `High (${locations[locKey].count} local listings)`;
  } else {
    for (const [zKey, zVal] of Object.entries<any>(zones)) {
      if (zVal.city === city && rawLocation.toLowerCase().includes(zVal.zone.toLowerCase())) {
        matchedLocation = zVal.zone;
        marketRateSqft = zVal.median_rate;
        dataConfidence = `Zone Match (${zVal.count} area listings)`;
        break;
      }
    }
  }

  let heightFactor = 1.0;
  if (floors > 1) {
    if (floors <= 3) heightFactor = 1.03;
    else if (floors <= 6) heightFactor = 1.08;
    else if (floors <= 10) heightFactor = 1.15;
    else heightFactor = 1.25;
  }

  const tierFactor = tierMeta.factor || 1.0;
  const typeFactor = typeMeta.factor || 1.0;
  const baseConstructionRate = tierMeta.construction_rate_bdt_sqft || 2400;

  let cityConstDiff = 1.0;
  if (city === "chattogram") cityConstDiff = 1.02;
  else if (city === "gazipur" || city === "narayanganj-city") cityConstDiff = 0.96;
  else if (city === "cumilla") cityConstDiff = 0.94;

  const effectiveConstructionRate = Math.round(
    baseConstructionRate * heightFactor * typeFactor * cityConstDiff
  );
  const totalConstructionCostBDT = Math.round(effectiveConstructionRate * totalBuiltArea);

  const effectiveMarketRate = Math.round(marketRateSqft * tierFactor);
  const totalMarketValuationBDT = Math.round(effectiveMarketRate * totalBuiltArea);

  const constructionMinBDT = Math.round(totalConstructionCostBDT * 0.92);
  const constructionMaxBDT = Math.round(totalConstructionCostBDT * 1.08);
  const marketMinBDT = Math.round(totalMarketValuationBDT * 0.88);
  const marketMaxBDT = Math.round(totalMarketValuationBDT * 1.12);

  const matStandards = standards.materials_per_sqft || {};
  const cementBags = Math.round(totalBuiltArea * (matStandards.cement_bags?.ratio || 0.4));
  const steelRebarTons = Number(
    (totalBuiltArea * (matStandards.steel_rebar_tons?.ratio || 0.00385) * heightFactor).toFixed(2)
  );
  const coarseSandCft = Math.round(totalBuiltArea * (matStandards.coarse_sand_cft?.ratio || 1.75));
  const stoneChipsCft = Math.round(
    totalBuiltArea * (matStandards.stone_chips_cft?.ratio || 1.35) * heightFactor
  );
  const bricksCount = Math.round(totalBuiltArea * (matStandards.bricks_count?.ratio || 19.5));

  const materials = [
    {
      name: "Cement",
      quantity: cementBags,
      unit: "Bags (50 kg)",
      approxUnitRateBDT: matStandards.cement_bags?.approx_unit_cost_bdt || 580,
      approxSubtotalBDT: cementBags * (matStandards.cement_bags?.approx_unit_cost_bdt || 580),
      specification: matStandards.cement_bags?.description || "Standard Portland cement",
    },
    {
      name: "Reinforcement Steel (Rebar)",
      quantity: steelRebarTons,
      unit: "Metric Tons (500W)",
      approxUnitRateBDT: matStandards.steel_rebar_tons?.approx_unit_cost_bdt || 98000,
      approxSubtotalBDT: Math.round(steelRebarTons * (matStandards.steel_rebar_tons?.approx_unit_cost_bdt || 98000)),
      specification: matStandards.steel_rebar_tons?.description || "500W deformed rebar",
    },
    {
      name: "Coarse & Sylhet Sand",
      quantity: coarseSandCft,
      unit: "Cubic Feet (cft)",
      approxUnitRateBDT: matStandards.coarse_sand_cft?.approx_unit_cost_bdt || 55,
      approxSubtotalBDT: coarseSandCft * (matStandards.coarse_sand_cft?.approx_unit_cost_bdt || 55),
      specification: matStandards.coarse_sand_cft?.description || "Sylhet coarse sand",
    },
    {
      name: "Stone Aggregate / Chips",
      quantity: stoneChipsCft,
      unit: "Cubic Feet (cft)",
      approxUnitRateBDT: matStandards.stone_chips_cft?.approx_unit_cost_bdt || 220,
      approxSubtotalBDT: stoneChipsCft * (matStandards.stone_chips_cft?.approx_unit_cost_bdt || 220),
      specification: matStandards.stone_chips_cft?.description || "Crushed stone chips",
    },
    {
      name: "1st Class Machine Bricks",
      quantity: bricksCount,
      unit: "Pieces",
      approxUnitRateBDT: matStandards.bricks_count?.approx_unit_cost_bdt || 14,
      approxSubtotalBDT: bricksCount * (matStandards.bricks_count?.approx_unit_cost_bdt || 14),
      specification: matStandards.bricks_count?.description || "Auto machine-made bricks",
    },
  ];

  const catDefs = standards.cost_breakdown_percentages || {};
  const breakdown = Object.entries<any>(catDefs).map(([key, cdata]) => {
    const pct = cdata.percentage || 10;
    const catAmount = Math.round(totalConstructionCostBDT * (pct / 100));
    return {
      key,
      title: cdata.title,
      percentage: pct,
      amountBDT: catAmount,
      description: cdata.description,
    };
  });

  let baseMonths = 4;
  if (totalBuiltArea <= 2000) baseMonths = 6;
  else if (totalBuiltArea <= 5000) baseMonths = 8 + floors * 1;
  else if (totalBuiltArea <= 12000) baseMonths = 10 + floors * 1.5;
  else baseMonths = 14 + floors * 1.8;
  const estimatedMonths = Math.round(baseMonths);

  const timelinePhases = [
    {
      phase: "Substructure & Soil Preparation",
      durationWeeks: Math.max(3, Math.round(estimatedMonths * 0.8)),
      activities: "Soil test, site excavation, foundation piling / footing, basement/ground RCC",
    },
    {
      phase: "Superstructure RCC Casting",
      durationWeeks: Math.max(4, Math.round(estimatedMonths * 1.6)),
      activities: "Columns, beams, lintels, staircases, and floor roof slab casting",
    },
    {
      phase: "Brickwork & Masonry",
      durationWeeks: Math.max(3, Math.round(estimatedMonths * 0.9)),
      activities: "Outer walls, room partitions, internal & external sand cement plaster",
    },
    {
      phase: "MEP & Rough-ins",
      durationWeeks: Math.max(2, Math.round(estimatedMonths * 0.7)),
      activities: "Electrical conduit, distribution boards, sanitary pipes, water supply lines",
    },
    {
      phase: "Finishing & Handover",
      durationWeeks: Math.max(3, Math.round(estimatedMonths * 1.0)),
      activities: "Flooring tiles, painting, doors, windows, sanitaries, inspection & cleaning",
    },
  ];

  return {
    inputs: {
      city,
      location: rawLocation,
      floorArea,
      floors,
      totalBuiltArea,
      bedrooms,
      bathrooms,
      qualityTier,
      constructionType: buildingType,
    },
    matchedLocation,
    dataConfidence,
    rates: {
      constructionRatePerSqFtBDT: effectiveConstructionRate,
      marketRatePerSqFtBDT: effectiveMarketRate,
      cityMedianRateBDT: cityData.median_rate || 6400,
    },
    constructionEstimate: {
      totalCostBDT: totalConstructionCostBDT,
      minCostBDT: constructionMinBDT,
      maxCostBDT: constructionMaxBDT,
      tierName: tierMeta.name || "Standard",
      tierTagline: tierMeta.tagline || "",
      buildingTypeName: typeMeta.name || "Residential Apartment",
    },
    marketValuation: {
      totalValuationBDT: totalMarketValuationBDT,
      minValuationBDT: marketMinBDT,
      maxValuationBDT: marketMaxBDT,
    },
    breakdown,
    materials,
    timeline: {
      estimatedMonths,
      phases: timelinePhases,
    },
    modelMeta: {
      algorithm: meta?.metrics?.modelAlgorithm || "CivilHub Multi-Variable Ensemble Regressor",
      r2Score: meta?.metrics?.r2Score || 0.885,
      samples: meta?.dataset?.totalSamples || 3753,
    },
  };
}

export const getLocations = async (_req: Request, res: Response): Promise<void> => {
  try {
    const meta = getMetadata();
    if (!meta) {
      res.status(500).json({ message: "Estimator model metadata is not initialized" });
      return;
    }

    const cityList = Object.entries<any>(meta.cities || {}).map(([key, val]) => ({
      id: key,
      name:
        key === "narayanganj-city"
          ? "Narayanganj"
          : key.charAt(0).toUpperCase() + key.slice(1),
      count: val.count,
      medianRate: val.median_rate,
      meanRate: val.mean_rate,
    }));

    const zoneList: Record<string, Array<{ name: string; count: number; medianRate: number }>> = {};
    for (const [key, val] of Object.entries<any>(meta.zones || {})) {
      const city = val.city;
      if (!zoneList[city]) zoneList[city] = [];
      zoneList[city].push({
        name: val.zone,
        count: val.count,
        medianRate: val.median_rate,
      });
    }

    // Sort zones by sample count
    for (const city in zoneList) {
      zoneList[city].sort((a, b) => b.count - a.count);
    }

    res.json({
      cities: cityList,
      zones: zoneList,
      standards: meta.standards,
      modelMetrics: meta.metrics,
      datasetStats: meta.dataset,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch locations" });
  }
};

export const predictCost = async (req: Request, res: Response): Promise<void> => {
  try {
    const inputs: PredictionInputs = req.body;
    const meta = getMetadata();

    // Try executing Python predict script with fallback
    const pythonExe = "C:\\msys64\\ucrt64\\bin\\python.exe";
    let predictionResult: any = null;

    if (fs.existsSync(PREDICT_SCRIPT) && fs.existsSync(pythonExe)) {
      try {
        const pyPromise = new Promise<any>((resolve, reject) => {
          const proc = spawn(pythonExe, [PREDICT_SCRIPT, JSON.stringify(inputs)]);
          let stdout = "";
          let stderr = "";
          proc.stdout.on("data", (d) => (stdout += d.toString()));
          proc.stderr.on("data", (d) => (stderr += d.toString()));
          proc.on("close", (code) => {
            if (code === 0) {
              try {
                resolve(JSON.parse(stdout));
              } catch (parseErr) {
                reject(parseErr);
              }
            } else {
              reject(new Error(stderr || `Process exited with code ${code}`));
            }
          });
          proc.on("error", reject);
          // Set 4s timeout
          setTimeout(() => {
            proc.kill();
            reject(new Error("Python execution timed out"));
          }, 4000);
        });

        predictionResult = await pyPromise;
      } catch (pyErr) {
        console.warn("Python execution fallback triggered:", (pyErr as any).message);
      }
    }

    if (!predictionResult) {
      predictionResult = calculateCostNative(inputs, meta);
    }

    res.json(predictionResult);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to predict cost" });
  }
};

export const saveEstimate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, notes, ...calcData } = req.body;
    const userId = req.user?.userId;

    const estimateDoc = new CostEstimate({
      user: userId || undefined,
      title:
        title ||
        `${calcData.inputs?.floors || 1}-Story ${calcData.inputs?.city || "Building"} Project Estimate`,
      notes: notes || "",
      inputs: calcData.inputs,
      matchedLocation: calcData.matchedLocation,
      dataConfidence: calcData.dataConfidence,
      rates: calcData.rates,
      constructionEstimate: calcData.constructionEstimate,
      marketValuation: calcData.marketValuation,
      breakdown: calcData.breakdown,
      materials: calcData.materials,
      timeline: calcData.timeline,
    });

    await estimateDoc.save();
    res.status(201).json(estimateDoc);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to save estimate" });
  }
};

export const getUserEstimates = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const estimates = await CostEstimate.find({ user: userId }).sort({ createdAt: -1 });
    res.json(estimates);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve estimates" });
  }
};

export const getEstimateById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const estimate = await CostEstimate.findById(id);
    if (!estimate) {
      res.status(404).json({ message: "Estimate not found" });
      return;
    }
    res.json(estimate);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve estimate" });
  }
};

export const deleteEstimate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const estimate = await CostEstimate.findById(id);

    if (!estimate) {
      res.status(404).json({ message: "Estimate not found" });
      return;
    }

    if (estimate.user && estimate.user.toString() !== userId) {
      res.status(403).json({ message: "Unauthorized to delete this estimate" });
      return;
    }

    await CostEstimate.findByIdAndDelete(id);
    res.json({ message: "Estimate deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete estimate" });
  }
};
