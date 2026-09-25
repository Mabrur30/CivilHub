import { Router } from "express";
import {
  gatewayIpn,
  gatewayReturn,
  getPayment,
  startCheckout,
  type CheckoutBody,
} from "../controllers/payment.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const paymentsRouter = Router();

paymentsRouter.post("/checkout", protect, (req, res, next) =>
  startCheckout(req as AuthenticatedRequest<CheckoutBody>, res, next),
);

// SSLCommerz calls these. They carry no login, so they trust only what the
// SSLCommerz validation API confirms.
paymentsRouter.post("/sslcommerz/success", gatewayReturn("success"));
paymentsRouter.post("/sslcommerz/fail", gatewayReturn("fail"));
paymentsRouter.post("/sslcommerz/cancel", gatewayReturn("cancel"));
paymentsRouter.post("/sslcommerz/ipn", gatewayIpn);

paymentsRouter.get("/:tranId", protect, (req, res, next) =>
  getPayment(req as AuthenticatedRequest, res, next),
);

export default paymentsRouter;
