import { type NextFunction, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { type UserRole } from "../models/User.model";

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
  role === "client" || role === "engineer";

const isVerifiedJwtPayload = (
  payload: string | jwt.JwtPayload,
): payload is VerifiedJwtPayload =>
  typeof payload !== "string" &&
  typeof payload.userId === "string" &&
  isUserRole(payload.role);

export const protect = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  try {
    const token = req.cookies?.civilhub_token;
    const secret = process.env.JWT_SECRET;

    if (!token) {
      throw createAuthError("Authentication required");
    }

    if (!secret) {
      throw new Error("JWT_SECRET is not configured");
    }

    const decoded = jwt.verify(token, secret);

    if (!isVerifiedJwtPayload(decoded)) {
      throw createAuthError("Invalid authentication token");
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
