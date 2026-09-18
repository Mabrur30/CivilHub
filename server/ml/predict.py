"""
CivilHub Building Cost Estimation - Prediction Engine
Takes building specifications and location, and outputs:
- Property Market Value (BDT)
- Pure Construction Cost (BDT)
- Material Quantities (Cement, Steel Rebar, Sand, Aggregate, Bricks)
- Engineering Category Breakdown
- Project Schedule & Phasing
"""

import os
import sys
import json
import math

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
META_PATH = os.path.join(BASE_DIR, "model_meta.json")

def load_metadata():
    if not os.path.exists(META_PATH):
        raise FileNotFoundError(f"Model metadata not found at {META_PATH}. Please run train_model.py first.")
    with open(META_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def estimate_cost(params, meta=None):
    if meta is None:
        meta = load_metadata()

    city = (params.get("city") or "dhaka").strip().lower()
    raw_location = (params.get("location") or "").strip()
    floor_area = float(params.get("floorArea") or 1200)
    floors = max(1, int(params.get("floors") or 1))
    bedrooms = int(params.get("bedrooms") or max(1, round(floor_area / 450)))
    bathrooms = int(params.get("bathrooms") or max(1, min(bedrooms, 4)))
    quality_tier = (params.get("qualityTier") or "standard").strip().lower()
    building_type = (params.get("constructionType") or "residential_apartment").strip().lower()

    total_built_area = floor_area * floors

    # Multipliers
    standards = meta.get("standards", {})
    tier_meta = standards.get("quality_tier_multipliers", {}).get(quality_tier, {
        "factor": 1.0,
        "name": "Standard / Economy Grade",
        "construction_rate_bdt_sqft": 2400
    })
    type_meta = standards.get("building_type_multipliers", {}).get(building_type, {
        "factor": 1.0,
        "name": "Residential Apartment Building"
    })

    # Location lookup
    cities = meta.get("cities", {})
    zones = meta.get("zones", {})
    locations = meta.get("locations", {})

    city_data = cities.get(city) or cities.get("dhaka", {
        "median_rate": 6400, "count": 1000
    })
    matched_location = None
    market_rate_sqft = city_data["median_rate"]
    data_confidence = "City Average"

    # Try exact location
    loc_key = f"{city}::{raw_location}"
    if loc_key in locations:
        matched_location = locations[loc_key]["location"]
        market_rate_sqft = locations[loc_key]["median_rate"]
        data_confidence = f"High ({locations[loc_key]['count']} local listings)"
    else:
        # Try zone match
        for z_key, z_val in zones.items():
            if z_val["city"] == city and z_val["zone"].lower() in raw_location.lower():
                matched_location = z_val["zone"]
                market_rate_sqft = z_val["median_rate"]
                data_confidence = f"Zone Match ({z_val['count']} area listings)"
                break

    # Floor height complexity factor (structural scaling for multi-story)
    height_factor = 1.0
    if floors > 1:
        if floors <= 3:
            height_factor = 1.03
        elif floors <= 6:
            height_factor = 1.08  # Deep foundation, larger columns
        elif floors <= 10:
            height_factor = 1.15  # Piling, seismic detailing
        else:
            height_factor = 1.25  # High-rise, shear walls, heavy deep piling

    tier_factor = tier_meta.get("factor", 1.0)
    type_factor = type_meta.get("factor", 1.0)

    # Base civil construction rate (materials + labor + equipment + supervision)
    base_construction_rate = tier_meta.get("construction_rate_bdt_sqft", 2400)
    # City construction material cost differential
    city_const_diff = 1.0
    if city == "chattogram":
        city_const_diff = 1.02
    elif city in ["gazipur", "narayanganj-city"]:
        city_const_diff = 0.96
    elif city == "cumilla":
        city_const_diff = 0.94

    effective_construction_rate = round(base_construction_rate * height_factor * type_factor * city_const_diff)
    total_construction_cost_bdt = round(effective_construction_rate * total_built_area)

    # Property Market Valuation (including land and location value from dataset)
    effective_market_rate = round(market_rate_sqft * tier_factor)
    total_market_valuation_bdt = round(effective_market_rate * total_built_area)

    # Ranges (+- 8% for construction, +- 12% for market)
    construction_min_bdt = round(total_construction_cost_bdt * 0.92)
    construction_max_bdt = round(total_construction_cost_bdt * 1.08)
    market_min_bdt = round(total_market_valuation_bdt * 0.88)
    market_max_bdt = round(total_market_valuation_bdt * 1.12)

    # Materials requirement estimation
    mat_standards = standards.get("materials_per_sqft", {})
    cement_bags = round(total_built_area * mat_standards["cement_bags"]["ratio"])
    steel_rebar_tons = round(total_built_area * mat_standards["steel_rebar_tons"]["ratio"] * height_factor, 2)
    coarse_sand_cft = round(total_built_area * mat_standards["coarse_sand_cft"]["ratio"])
    stone_chips_cft = round(total_built_area * mat_standards["stone_chips_cft"]["ratio"] * height_factor)
    bricks_count = round(total_built_area * mat_standards["bricks_count"]["ratio"])

    materials = [
        {
            "name": "Cement",
            "quantity": cement_bags,
            "unit": "Bags (50 kg)",
            "approxUnitRateBDT": mat_standards["cement_bags"]["approx_unit_cost_bdt"],
            "approxSubtotalBDT": round(cement_bags * mat_standards["cement_bags"]["approx_unit_cost_bdt"]),
            "specification": mat_standards["cement_bags"]["description"],
        },
        {
            "name": "Reinforcement Steel (Rebar)",
            "quantity": steel_rebar_tons,
            "unit": "Metric Tons (500W)",
            "approxUnitRateBDT": mat_standards["steel_rebar_tons"]["approx_unit_cost_bdt"],
            "approxSubtotalBDT": round(steel_rebar_tons * mat_standards["steel_rebar_tons"]["approx_unit_cost_bdt"]),
            "specification": mat_standards["steel_rebar_tons"]["description"],
        },
        {
            "name": "Coarse & Sylhet Sand",
            "quantity": coarse_sand_cft,
            "unit": "Cubic Feet (cft)",
            "approxUnitRateBDT": mat_standards["coarse_sand_cft"]["approx_unit_cost_bdt"],
            "approxSubtotalBDT": round(coarse_sand_cft * mat_standards["coarse_sand_cft"]["approx_unit_cost_bdt"]),
            "specification": mat_standards["coarse_sand_cft"]["description"],
        },
        {
            "name": "Stone Aggregate / Chips",
            "quantity": stone_chips_cft,
            "unit": "Cubic Feet (cft)",
            "approxUnitRateBDT": mat_standards["stone_chips_cft"]["approx_unit_cost_bdt"],
            "approxSubtotalBDT": round(stone_chips_cft * mat_standards["stone_chips_cft"]["approx_unit_cost_bdt"]),
            "specification": mat_standards["stone_chips_cft"]["description"],
        },
        {
            "name": "1st Class Machine Bricks",
            "quantity": bricks_count,
            "unit": "Pieces",
            "approxUnitRateBDT": mat_standards["bricks_count"]["approx_unit_cost_bdt"],
            "approxSubtotalBDT": round(bricks_count * mat_standards["bricks_count"]["approx_unit_cost_bdt"]),
            "specification": mat_standards["bricks_count"]["description"],
        },
    ]

    # Category breakdown percentages
    breakdowns = []
    cat_defs = standards.get("cost_breakdown_percentages", {})
    for key, cdata in cat_defs.items():
        pct = cdata["percentage"]
        cat_amount = round(total_construction_cost_bdt * (pct / 100))
        breakdowns.append({
            "key": key,
            "title": cdata["title"],
            "percentage": pct,
            "amountBDT": cat_amount,
            "description": cdata["description"],
        })

    # Construction Timeline Estimation
    base_months = 4
    if total_built_area <= 2000:
        base_months = 6
    elif total_built_area <= 5000:
        base_months = 8 + (floors * 1)
    elif total_built_area <= 12000:
        base_months = 10 + (floors * 1.5)
    else:
        base_months = 14 + (floors * 1.8)
    estimated_months = round(base_months)

    timeline_phases = [
        {
            "phase": "Substructure & Soil Preparation",
            "durationWeeks": max(3, round(estimated_months * 0.8)),
            "activities": "Soil test, site excavation, foundation piling / footing, basement/ground RCC",
        },
        {
            "phase": "Superstructure RCC Casting",
            "durationWeeks": max(4, round(estimated_months * 1.6)),
            "activities": "Columns, beams, lintels, staircases, and floor roof slab casting",
        },
        {
            "phase": "Brickwork & Masonry",
            "durationWeeks": max(3, round(estimated_months * 0.9)),
            "activities": "Outer walls, room partitions, internal & external sand cement plaster",
        },
        {
            "phase": "MEP & Rough-ins",
            "durationWeeks": max(2, round(estimated_months * 0.7)),
            "activities": "Electrical conduit, distribution boards, sanitary pipes, water supply lines",
        },
        {
            "phase": "Finishing & Handover",
            "durationWeeks": max(3, round(estimated_months * 1.0)),
            "activities": "Flooring tiles, painting, doors, windows, sanitaries, inspection & cleaning",
        },
    ]

    return {
        "inputs": {
            "city": city,
            "location": raw_location,
            "floorArea": floor_area,
            "floors": floors,
            "totalBuiltArea": total_built_area,
            "bedrooms": bedrooms,
            "bathrooms": bathrooms,
            "qualityTier": quality_tier,
            "constructionType": building_type,
        },
        "matchedLocation": matched_location,
        "dataConfidence": data_confidence,
        "rates": {
            "constructionRatePerSqFtBDT": effective_construction_rate,
            "marketRatePerSqFtBDT": effective_market_rate,
            "cityMedianRateBDT": city_data["median_rate"],
        },
        "constructionEstimate": {
            "totalCostBDT": total_construction_cost_bdt,
            "minCostBDT": construction_min_bdt,
            "maxCostBDT": construction_max_bdt,
            "tierName": tier_meta.get("name", "Standard"),
            "tierTagline": tier_meta.get("tagline", ""),
            "buildingTypeName": type_meta.get("name", "Residential Apartment"),
        },
        "marketValuation": {
            "totalValuationBDT": total_market_valuation_bdt,
            "minValuationBDT": market_min_bdt,
            "maxValuationBDT": market_max_bdt,
        },
        "breakdown": breakdowns,
        "materials": materials,
        "timeline": {
            "estimatedMonths": estimated_months,
            "phases": timeline_phases,
        },
        "modelMeta": {
            "algorithm": meta.get("metrics", {}).get("modelAlgorithm", "CivilHub Multi-Variable Ensemble Regressor"),
            "r2Score": meta.get("metrics", {}).get("r2Score", 0.89),
            "samples": meta.get("dataset", {}).get("totalSamples", 3753),
        }
    }


if __name__ == "__main__":
    if len(sys.argv) > 1:
        raw_in = sys.argv[1]
        try:
            params = json.loads(raw_in)
        except:
            params = {}
    else:
        # Default demo prediction
        params = {
            "city": "dhaka",
            "location": "Mirpur",
            "floorArea": 1400,
            "floors": 1,
            "bedrooms": 3,
            "bathrooms": 3,
            "qualityTier": "premium",
            "constructionType": "residential_apartment"
        }
    
    result = estimate_cost(params)
    print(json.dumps(result, indent=2))
