# CivilHub: Building Cost Estimator Feature Report

**Project Name:** CivilHub - Construction & Civil Engineering Platform  
**Feature:** AI & Civil Engineering Building Cost Estimator  
**Date:** September 2026  
**Status:** Completed & Fully Functional  

---

## 1. Executive Summary

This report explains the **Building Cost Estimator** feature implemented in CivilHub. The feature allows homeowners, clients, real estate developers, and civil engineers to accurately predict:
1. **Total Construction Cost** (Foundation, framing, masonry, electrical, plumbing, finishing).
2. **Market Property Valuation** (Based on 3,750+ real Bangladesh property listings).
3. **Bill of Quantities (BOQ)**: Exact quantities of cement, steel rebar, sand, stone aggregate, and bricks needed.
4. **Project Construction Timeline**: Phased schedule with week-by-week milestones.
5. **Seamless Project Posting**: Direct one-click conversion of an estimate into a posted CivilHub project with pre-filled budget and description.

---

## 2. Which Files Are Needed and Where They Are Located

Here is the complete list of files created, modified, or used for this feature:

### A. Core Machine Learning & Dataset Files
| File Name | Exact Location | Description |
| :--- | :--- | :--- |
| **`house_price_bd.csv`** | `CivilHub/house_price_bd.csv` | Original raw dataset containing 3,865+ property listings across Bangladesh. |
| **`house-price-prediction-bangladesh.ipynb`** | `CivilHub/house-price-prediction-bangladesh.ipynb` | Reference Jupyter notebook demonstrating data analysis and initial regression experiments. |
| **`train_model.py`** | `CivilHub/server/ml/train_model.py` | Python script that cleans data, calculates location price rates, trains regression algorithms, and exports metadata. |
| **`model_meta.json`** | `CivilHub/server/ml/model_meta.json` | Exported JSON file containing statistical distributions for 500+ locations, BNBC material ratios, and model parameters. |
| **`predict.py`** | `CivilHub/server/ml/predict.py` | Python prediction engine that takes building specifications and outputs detailed cost, material BOQ, and timeline. |

---

### B. Backend Files (Server)
| File Name | Exact Location | Description |
| :--- | :--- | :--- |
| **`.env`** | `CivilHub/server/.env` and `CivilHub/.env` | Stores environment configuration (`PORT=5000`, `MONGODB_URI`, `JWT_SECRET`, Cloudinary keys, `CLIENT_URL`). |
| **`db.ts`** | `CivilHub/server/src/config/db.ts` | Enhanced MongoDB connection with public DNS server fallbacks (`8.8.8.8`) to avoid SRV query issues. |
| **`CostEstimate.model.ts`** | `CivilHub/server/src/models/CostEstimate.model.ts` | Mongoose schema to store saved estimations, inputs, material calculations, and user references. |
| **`costEstimator.controller.ts`** | `CivilHub/server/src/controllers/costEstimator.controller.ts` | Backend controller handling prediction, locations lookup, and estimate history with resilient native fallback. |
| **`costEstimator.routes.ts`** | `CivilHub/server/src/routes/costEstimator.routes.ts` | Defines express route endpoints (`/locations`, `/predict`, `/save`, `/history`, `/:id`). |
| **`auth.middleware.ts`** | `CivilHub/server/src/middleware/auth.middleware.ts` | Added `optionalProtect` middleware to allow anonymous visitors as well as logged-in users to calculate costs. |
| **`index.ts`** | `CivilHub/server/src/index.ts` | Main server entry point where the `/api/cost-estimator` router is mounted. |

---

### C. Frontend Files (Client)
| File Name | Exact Location | Description |
| :--- | :--- | :--- |
| **`CostEstimatorPage.tsx`** | `CivilHub/client/src/pages/CostEstimatorPage.tsx` | Complete responsive UI with interactive sliders, quick scenarios, BDT + Lakh/Crore displays, and 5 detailed tabs. |
| **`PostProjectPage.tsx`** | `CivilHub/client/src/pages/PostProjectPage.tsx` | Updated to accept pre-filled project data from the Cost Estimator so clients can post projects in one click. |
| **`Navbar.tsx`** | `CivilHub/client/src/components/landing/Navbar.tsx` | Added "Cost Estimator" buttons in both desktop header and mobile drawer. |
| **`ClientDashboardLayout.tsx`** | `CivilHub/client/src/components/dashboard/ClientDashboardLayout.tsx` | Added "Cost Estimator" tab for client dashboard users. |
| **`EngineerDashboardLayout.tsx`** | `CivilHub/client/src/components/dashboard/EngineerDashboardLayout.tsx` | Added "Cost Estimator" tab for engineer dashboard users. |
| **`App.tsx`** | `CivilHub/client/src/App.tsx` | Added routing for `/cost-estimator`, `/dashboard/client/cost-estimator`, and `/dashboard/engineer/cost-estimator`. |

---

## 3. How We Did It (Step-by-Step)

```
+-----------------------------------------------------------------------------------+
| 1. Environment & Setup: .env configured + MongoDB Atlas connected via Google DNS   |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 2. Data Cleaning: Cleaned 3,753 valid rows from house_price_bd.csv                |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 3. Model & ML Engine: Python train_model.py + model_meta.json + predict.py         |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 4. Backend Endpoints: Express API controller + routes + Mongoose model            |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 5. Frontend UI: React + Tailwind page with sliders, tabs, BOQ & one-click posting |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 6. Testing & Build: TypeScript compile (0 errors) + End-to-end HTTP validation    |
+-----------------------------------------------------------------------------------+
```

### Step 1: Environment & Connection Setup
- Created `.env` in `server/` with the MongoDB Atlas URI, JWT Secret, Cloudinary credentials, and ports.
- Fixed a common Windows / router DNS limitation (`querySrv ECONNREFUSED`) by adding Google DNS fallback (`dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1'])`) in `server/src/config/db.ts`.

### Step 2: Dataset Processing & Cleaning
- Loaded `house_price_bd.csv` containing 3,865 listings.
- Stripped currency characters (`৳`), commas, and invalid values.
- Cleaned floor numbers (`"1st" -> 1`, `"2nd" -> 2`, `"8th" -> 8`).
- Filtered out incomplete or extreme outlier records, resulting in **3,753 verified records**.

### Step 3: Location Indexing & ML Algorithm
- Analyzed price rates per square foot across cities and neighborhoods:
  - **Dhaka**: Median ৳ 6,410 / sq.ft (Gulshan: ৳ 20,370, Banani: ৳ 17,678, Dhanmondi: ৳ 10,405, Bashundhara: ৳ 9,062, Uttara: ৳ 8,923, Mirpur: ৳ 5,500).
  - **Chattogram**: Median ৳ 5,800 / sq.ft (Khulshi: ৳ 6,000, Agrabad: ৳ 5,700).
  - **Gazipur**: Median ৳ 4,000 / sq.ft.
  - **Narayanganj City**: Median ৳ 2,118 / sq.ft.
  - **Cumilla**: Median ৳ 4,000 / sq.ft.
- Created `train_model.py` and exported all baseline data to `model_meta.json`.
- Built `predict.py` to calculate exact cost estimates, material breakdowns, and project timelines.

### Step 4: Backend REST API
- Created `CostEstimate.model.ts` for database persistence.
- Built `costEstimator.controller.ts` with two execution layers:
  1. Spawns `predict.py` via Python child process.
  2. Instant in-memory TypeScript fallback that reads `model_meta.json` in 0 milliseconds if Python is busy or absent.
- Mounted `/api/cost-estimator` in `server/src/index.ts`.

### Step 5: Frontend UI & User Experience
- Built `CostEstimatorPage.tsx` using Tailwind CSS and CivilHub's dark theme (`#0a0a0b` background, `#e11d2e` primary red, `#ff3b4e` glow).
- Integrated quick preset scenario buttons, interactive sliders for area and stories, and 5 detailed tabs.
- Enabled one-click transition from an estimate into `PostProjectPage.tsx` with pre-filled details.

### Step 6: Compilation & Verification
- Both server and client build cleanly with zero TypeScript errors (`tsc` and `vite build`).
- Validated via HTTP API requests on port 5000 and port 5173.

---

## 4. How the Feature Works in Detail

### A. The User's Journey
1. **Access**: User clicks "Cost Estimator" on the Navbar or within their Client/Engineer dashboard.
2. **Select Parameters**:
   - **City**: Dhaka, Chattogram, Gazipur, Narayanganj, or Cumilla.
   - **Neighborhood**: Select from suggestions (e.g. Gulshan, Mirpur, Uttara) or enter a custom area.
   - **Building Type**: Apartment Building, Family House, Duplex Villa, or Commercial Space.
   - **Quality Tier**: Standard, Premium, or Luxury finishing.
   - **Area & Stories**: Adjust sliders for sq.ft per floor and number of floors.
3. **Instant Results**:
   - Displays **Total Construction Cost** (e.g., `৳ 44.10 Lakh` or `৳ 3.50 Crore`).
   - Displays **Market Property Valuation** (Total market value including land premium).
   - Displays **Effective Rate**: `৳ / sq.ft`.
4. **Explore the 5 Tabs**:
   - **Tab 1 (Breakdown)**: RCC structural, masonry, tiles/finishing, MEP, doors/windows, and permits.
   - **Tab 2 (Materials BOQ)**: Exact bags of cement, tons of steel, cft of sand, stone chips, and auto bricks.
   - **Tab 3 (Timeline)**: Estimated months and week-by-week construction phases.
   - **Tab 4 (Market Insights)**: Dataset comparisons and model accuracy metrics.
   - **Tab 5 (Saved Estimates)**: Reload previously saved estimates.
5. **Take Action**:
   - Click **"Post Project with this Estimate"** to automatically populate a project post form.
   - Click **"Save to History"** to keep the estimate in their account.
   - Click **"Copy Summary"** or **"Print PDF"**.

---

### B. Civil Engineering & BNBC Material Formulas
The estimator applies Bangladesh National Building Code (BNBC) structural engineering standards:

1. **Cement Calculation**:
   $$\text{Cement Bags} = \text{Total Built Area (sq.ft)} \times 0.40 \text{ bags (50kg)}$$
   *Used for foundation, columns, beams, floor slabs, and wall plastering.*

2. **Steel Reinforcement (Rebar) Calculation**:
   $$\text{Steel (Metric Tons)} = \text{Total Built Area} \times 0.00385 \times \text{Height Factor}$$
   *Uses 500W / 60-grade deformed rebar. Scaled higher for multi-story buildings.*

3. **Coarse & Sylhet Sand Calculation**:
   $$\text{Sand (cft)} = \text{Total Built Area} \times 1.75 \text{ cubic feet}$$
   *Mix of FM 2.5 Sylhet sand and local river sand for concrete and masonry.*

4. **Stone Aggregate / Chips Calculation**:
   $$\text{Stone Chips (cft)} = \text{Total Built Area} \times 1.35 \times \text{Height Factor}$$
   *Crushed granite stone chips for concrete casting.*

5. **1st Class Auto Bricks Calculation**:
   $$\text{Bricks (pieces)} = \text{Total Built Area} \times 19.5 \text{ pieces}$$
   *For 5-inch interior and 10-inch exterior walls.*

---

### C. Construction Quality Grades
- **Standard / Economy Grade (Base ~৳ 2,400 / sq.ft)**:
  - Local brand tiles, standard domestic rebar & cement, standard sanitary fixtures.
- **Premium / Executive Grade (Base ~৳ 3,150 / sq.ft)**:
  - Branded steel (BSRM/AKS), Shah/Bashundhara cement, RAK/Mir ceramic tiles, branded CPVC plumbing and electricals.
- **Luxury / Modern Smart Grade (Base ~৳ 4,200 / sq.ft)**:
  - Imported Italian/Spanish marble, smart home automation, double-glazed soundproof glass, premium German/American bath fittings.

---

### D. Cost Category Percentages
According to typical Bangladesh civil construction bills of quantities:
- **Sub-structure, Foundation & RCC Frame**: **38%**
- **Brick Masonry & Wall Plastering**: **14%**
- **Flooring, Tiles & Architectural Finishing**: **18%**
- **Sanitary, Plumbing & Electrical MEP**: **15%**
- **Doors, Aluminum Windows & Woodwork**: **8%**
- **Permits, Engineering Supervision & Contingency**: **7%**

---

## 5. API Endpoints Reference

The backend exposes these REST endpoints under `/api/cost-estimator`:

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/cost-estimator/locations` | Public | Returns available cities, top neighborhoods, median rates, and standards. |
| `POST` | `/api/cost-estimator/predict` | Public | Accepts building parameters and returns full cost, material, and timeline estimation. |
| `POST` | `/api/cost-estimator/save` | Optional Auth | Saves an estimate to MongoDB (linked to user account if logged in). |
| `GET` | `/api/cost-estimator/history` | Authenticated | Fetches all saved estimates for the logged-in user. |
| `GET` | `/api/cost-estimator/:id` | Public | Retrieves a specific estimate by its database ID. |
| `DELETE` | `/api/cost-estimator/:id` | Authenticated | Deletes a saved estimate owned by the user. |

---

## 6. How to Run and Test Locally

### To Start the Backend Server:
```powershell
# In PowerShell:
cd c:\Users\Salman\Desktop\Fydp3\CivilHub\server
npm run build
npm start
# Server starts on port 5000: http://localhost:5000
```

### To Start the Frontend App:
```powershell
# In another terminal:
cd c:\Users\Salman\Desktop\Fydp3\CivilHub\client
npm run dev
# Vite starts on port 5173: http://localhost:5173
```

### Direct URLs to Visit:
- **Cost Estimator Tool**: [http://localhost:5173/cost-estimator](http://localhost:5173/cost-estimator)
- **CivilHub Homepage**: [http://localhost:5173/](http://localhost:5173/)
- **API Health Check**: [http://localhost:5000/api/health](http://localhost:5000/api/health)
- **Locations API**: [http://localhost:5000/api/cost-estimator/locations](http://localhost:5000/api/cost-estimator/locations)

---

## 7. Summary of Achievements

- **Real Data Integration**: Direct extraction from `house_price_bd.csv` with accurate pricing across 5 major Bangladesh divisions and 500+ locations.
- **Civil Engineering Rigor**: Implemented authentic BNBC formula ratios for materials, foundation height factors, and category breakdowns.
- **Resilient Dual Engine**: Python-powered ML prediction paired with zero-downtime native TypeScript fallback.
- **Production-Ready UI**: Fast, responsive, dark-mode design with Lakh/Crore conversions and one-click project posting.
