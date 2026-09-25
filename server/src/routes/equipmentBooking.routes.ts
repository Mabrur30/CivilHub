import {
  type NextFunction,
  type Request,
  type Response,
  Router,
} from "express";
import { canReviewBooking } from "../controllers/review.controller";
import {
  cancelBookingRequest,
  confirmPickup,
  confirmReturn,
  createBookingRequest,
  getBookingByIdForUser,
  getEquipmentAvailability,
  getEquipmentQuote,
  getIncomingBookingRequests,
  getMyBookings,
  getOwnerBookings,
  resolveDeposit,
  respondToBookingRequest,
  type ConfirmConditionBody,
  type CreateBookingBody,
  type ResolveDepositBody,
  type RespondBookingBody,
} from "../controllers/equipmentBooking.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";
import {
  bookingConditionPhotoUpload,
  handleUploadError,
} from "../middleware/upload.middleware";

const equipmentBookingRouter = Router();

equipmentBookingRouter.get(
  "/equipment/:equipmentId/availability",
  protect,
  (req, res, next) =>
    getEquipmentAvailability(req as AuthenticatedRequest, res, next),
);

equipmentBookingRouter.get(
  "/equipment/:equipmentId/quote",
  protect,
  (req, res, next) => getEquipmentQuote(req as AuthenticatedRequest, res, next),
);

equipmentBookingRouter.post("/equipment-bookings", protect, (req, res, next) =>
  createBookingRequest(
    req as AuthenticatedRequest<CreateBookingBody>,
    res,
    next,
  ),
);

equipmentBookingRouter.get(
  "/equipment-bookings/incoming",
  protect,
  (req, res, next) =>
    getIncomingBookingRequests(req as AuthenticatedRequest, res, next),
);

equipmentBookingRouter.get(
  "/equipment-bookings/mine",
  protect,
  (req, res, next) => getMyBookings(req as AuthenticatedRequest, res, next),
);

equipmentBookingRouter.get(
  "/equipment-bookings/owner",
  protect,
  (req, res, next) => getOwnerBookings(req as AuthenticatedRequest, res, next),
);

equipmentBookingRouter.get(
  "/equipment-bookings/:bookingId",
  protect,
  (req, res, next) =>
    getBookingByIdForUser(req as AuthenticatedRequest, res, next),
);

equipmentBookingRouter.get(
  "/equipment-bookings/:bookingId/can-review",
  protect,
  (req, res, next) => canReviewBooking(req as AuthenticatedRequest, res, next),
);

equipmentBookingRouter.patch(
  "/equipment-bookings/:bookingId/respond",
  protect,
  (req, res, next) =>
    respondToBookingRequest(
      req as AuthenticatedRequest<RespondBookingBody>,
      res,
      next,
    ),
);

equipmentBookingRouter.patch(
  "/equipment-bookings/:bookingId/cancel",
  protect,
  (req, res, next) =>
    cancelBookingRequest(req as AuthenticatedRequest, res, next),
);

equipmentBookingRouter.post(
  "/equipment-bookings/:bookingId/pickup",
  protect,
  bookingConditionPhotoUpload.array("photos", 4),
  handleUploadError,
  (req: Request, res: Response, next: NextFunction) =>
    confirmPickup(req as AuthenticatedRequest<ConfirmConditionBody>, res, next),
);

equipmentBookingRouter.post(
  "/equipment-bookings/:bookingId/return",
  protect,
  bookingConditionPhotoUpload.array("photos", 4),
  handleUploadError,
  (req: Request, res: Response, next: NextFunction) =>
    confirmReturn(req as AuthenticatedRequest<ConfirmConditionBody>, res, next),
);

equipmentBookingRouter.patch(
  "/equipment-bookings/:bookingId/resolve-deposit",
  protect,
  (req, res, next) =>
    resolveDeposit(req as AuthenticatedRequest<ResolveDepositBody>, res, next),
);

export default equipmentBookingRouter;
