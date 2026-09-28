import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { reverseGeocode, searchPlaces } from "../services/geocoding";

const geoRouter = Router();

// Signed-in only: the lookups spend our shared Nominatim allowance.
geoRouter.get("/search", protect, async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    res.status(200).json(await searchPlaces(q));
  } catch (error: unknown) {
    next(error);
  }
});

geoRouter.get("/reverse", protect, async (req, res, next) => {
  try {
    const place = await reverseGeocode(
      Number(req.query.lat),
      Number(req.query.lng),
    );
    res.status(200).json(place);
  } catch (error: unknown) {
    next(error);
  }
});

export default geoRouter;
