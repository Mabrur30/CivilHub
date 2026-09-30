import { type NextFunction, type Request, type Response, Router } from "express";
import {
  actionReports,
  adminLogin,
  adminLogout,
  adminMe,
  dismissReports,
  getOverview,
  getUserDetail,
  listActions,
  listReports,
  listUsers,
  setUserStatus,
} from "../controllers/admin.controller";
import { decideDeposit, getDeposit, listDeposits } from "../controllers/adminDeposits.controller";
import {
  approveVerification,
  getVerification,
  listVerifications,
  rejectVerification,
  revokeVerification,
} from "../controllers/adminVerification.controller";
import {
  checkRefund,
  getPayee,
  issueRefund,
  listPayees,
  listPayments,
  listRefunds,
  recordPayout,
} from "../controllers/adminMoney.controller";
import { type AdminRequest, requireAdmin } from "../middleware/adminAuth.middleware";
import { adminLoginLimiter } from "../middleware/rateLimit";

type AdminHandler = (req: AdminRequest<never>, res: Response, next: NextFunction) => unknown;

// Express types the request loosely; requireAdmin has set `admin` by now.
const handle =
  (handler: AdminHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    void handler(req as unknown as AdminRequest<never>, res, next);
  };

const adminRouter = Router();

adminRouter.post("/auth/login", adminLoginLimiter, handle(adminLogin));
adminRouter.post("/auth/logout", handle(adminLogout));

// Everything below needs a signed-in, enabled admin.
adminRouter.use(requireAdmin);

adminRouter.get("/auth/me", handle(adminMe));
adminRouter.get("/overview", handle(getOverview));
adminRouter.get("/reports", handle(listReports));
adminRouter.post("/reports/:targetType/:targetId/dismiss", handle(dismissReports));
adminRouter.post("/reports/:targetType/:targetId/action", handle(actionReports));
adminRouter.get("/users", handle(listUsers));
adminRouter.get("/users/:userId", handle(getUserDetail));
adminRouter.post("/users/:userId/status", handle(setUserStatus));
adminRouter.get("/actions", handle(listActions));

adminRouter.get("/money/payees", handle(listPayees));
adminRouter.get("/money/payees/:userId", handle(getPayee));
adminRouter.post("/money/payees/:userId/payouts", handle(recordPayout));
adminRouter.get("/money/refunds", handle(listRefunds));
adminRouter.post("/money/refunds", handle(issueRefund));
adminRouter.post("/money/refunds/:refundId/check", handle(checkRefund));
adminRouter.get("/money/payments", handle(listPayments));

adminRouter.get("/deposits", handle(listDeposits));
adminRouter.get("/deposits/:bookingId", handle(getDeposit));
adminRouter.post("/deposits/:bookingId/decide", handle(decideDeposit));

adminRouter.get("/verifications", handle(listVerifications));
adminRouter.get("/verifications/:userId", handle(getVerification));
adminRouter.post("/verifications/:userId/approve", handle(approveVerification));
adminRouter.post("/verifications/:userId/reject", handle(rejectVerification));
adminRouter.post("/verifications/:userId/revoke", handle(revokeVerification));

export default adminRouter;
