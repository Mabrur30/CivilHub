import { Router } from "express";
import { getCommissionRate } from "../utils/platformSettings";

/**
 * Facts about the platform that anyone may read, signed in or not, such as
 * the commission the landing page quotes.
 */
const publicRouter = Router();

publicRouter.get("/platform", async (_req, res, next) => {
  try {
    res.json({ commissionRate: await getCommissionRate() });
  } catch (error: unknown) {
    next(error);
  }
});

export default publicRouter;
