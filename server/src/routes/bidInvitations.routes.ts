import { Router } from "express";
import {
  acceptBidInvitation,
  createBidInvitation,
  declineBidInvitation,
  getClientInviteProjectsForEngineer,
  getMyPendingBidInvitations,
  type AcceptBidInvitationBody,
  type CreateBidInvitationBody,
} from "../controllers/bidInvitation.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const bidInvitationsRouter = Router();

bidInvitationsRouter.post("/", protect, (req, res, next) =>
  createBidInvitation(
    req as AuthenticatedRequest<CreateBidInvitationBody>,
    res,
    next,
  ),
);

bidInvitationsRouter.get("/engineer/pending", protect, (req, res, next) =>
  getMyPendingBidInvitations(req as AuthenticatedRequest, res, next),
);

bidInvitationsRouter.get(
  "/client/engineers/:engineerId/projects",
  protect,
  (req, res, next) =>
    getClientInviteProjectsForEngineer(req as AuthenticatedRequest, res, next),
);

bidInvitationsRouter.patch("/:invitationId/accept", protect, (req, res, next) =>
  acceptBidInvitation(
    req as AuthenticatedRequest<AcceptBidInvitationBody>,
    res,
    next,
  ),
);

bidInvitationsRouter.patch(
  "/:invitationId/decline",
  protect,
  (req, res, next) =>
    declineBidInvitation(req as AuthenticatedRequest, res, next),
);

export default bidInvitationsRouter;
