import { type NextFunction, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { type UserRole } from "../models/User.model";
import { getAccountStanding, restrictionMessage } from "../utils/accountStatus";

export interface AuthenticatedUser {
  userId: string;
  role: UserRole;
}

export interface AuthenticatedRequest<ReqBody = unknown> extends Request<
  Record<string, never>,
  unknown,
  ReqBody
> {
  user: AuthenticatedUser;
}

interface VerifiedJwtPayload extends jwt.JwtPayload {
  userId: string;
  role: UserRole;
  /** The account's sessionVersion when issued; missing on older tokens, meaning 0. */
  sv?: number;
}

interface AuthError extends Error {
  statusCode: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const createAuthError = (message: string): AuthError => {
  const error = new Error(message) as AuthError;
  error.statusCode = 401;
  return error;
};

const isUserRole = (role: unknown): role is UserRole =>
  role === "client" || role === "engineer" || role === "organisation";

const isVerifiedJwtPayload = (
  payload: string | jwt.JwtPayload,
): payload is VerifiedJwtPayload =>
  typeof payload !== "string" &&
  typeof payload.userId === "string" &&
  isUserRole(payload.role);

/**
 * Session tokens are only as safe as the secret that signs them. Production
 * refuses to start with a short one; elsewhere it's a warning.
 */
export const assertUserSecretStrong = (): void => {
  const secret = process.env.JWT_SECRET ?? "";
  if (secret.length >= 32) return;
  const message = "JWT_SECRET must be at least 32 random characters";
  if (process.env.NODE_ENV === "production") throw new Error(message);
  console.warn(`${message}; fine for development, not for production.`);
};

export const protect = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = req.cookies?.civilhub_token;
    const secret = process.env.JWT_SECRET;

    if (!token) {
      throw createAuthError("Authentication required");
    }

    if (!secret) {
      throw new Error("JWT_SECRET is not configured");
    }

    let decoded: string | jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, secret);
    } catch {
      // Expired or tampered cookies are a sign-in problem, not a server fault.
      throw createAuthError("Your session has expired. Please sign in again.");
    }

    if (!isVerifiedJwtPayload(decoded)) {
      throw createAuthError("Invalid authentication token");
    }

    // A 7-day token outlives a suspension, so the account is checked each time.
    const standing = await getAccountStanding(decoded.userId);
    // A password change ends every session issued before it.
    if (!standing || (decoded.sv ?? 0) !== standing.sessionVersion) {
      throw createAuthError("Your session has expired. Please sign in again.");
    }
    if (standing.status !== "active") {
      const error = createAuthError(restrictionMessage(standing));
      error.statusCode = 403;
      throw error;
    }

    req.user = {
      userId: decoded.userId,
      role: decoded.role,
    };
    next();
  } catch (error: unknown) {
    next(error);
  }
};

export const optionalProtect = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  try {
    const token = req.cookies?.civilhub_token;
    const secret = process.env.JWT_SECRET;

    if (!token || !secret) {
      return next();
    }

    const decoded = jwt.verify(token, secret);
    if (isVerifiedJwtPayload(decoded)) {
      req.user = {
        userId: decoded.userId,
        role: decoded.role,
      };
    }
    next();
  } catch {
    // If token invalid/expired, continue without user
    next();
  }
};

