import { type NextFunction, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { Admin } from "../models/Admin.model";

/**
 * Admin sessions are kept apart from user sessions: their own cookie, sent
 * only to /api/admin, signed with their own secret. A user token can never
 * pass as an admin one, or the other way round.
 */

export const ADMIN_COOKIE = "civilhub_admin";
const ADMIN_COOKIE_PATH = "/api/admin";
const ADMIN_SESSION_HOURS = 8;

export interface AdminIdentity {
  id: string;
  name: string;
  email: string;
}

export interface AdminRequest<Body = unknown>
  extends Request<Record<string, string>, unknown, Body> {
  admin: AdminIdentity;
}

interface AdminTokenPayload extends jwt.JwtPayload {
  adminId: string;
  kind: "admin";
}

interface StatusError extends Error {
  statusCode: number;
}

export const adminError = (message: string, statusCode: number): StatusError => {
  const error = new Error(message) as StatusError;
  error.statusCode = statusCode;
  return error;
};

/**
 * The admin signing secret. It must be set and must differ from the user
 * one; otherwise admin routes refuse to work at all.
 */
export const getAdminSecret = (): string => {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret || secret.length < 32 || secret === process.env.JWT_SECRET) {
    throw new Error(
      "ADMIN_JWT_SECRET must be set, at least 32 characters, and different from JWT_SECRET",
    );
  }
  return secret;
};

export const adminCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? ("none" as const) : ("lax" as const),
  path: ADMIN_COOKIE_PATH,
  maxAge: ADMIN_SESSION_HOURS * 60 * 60 * 1000,
});

export const signAdminSession = (adminId: string): string =>
  jwt.sign({ adminId, kind: "admin" }, getAdminSecret(), {
    expiresIn: `${ADMIN_SESSION_HOURS}h`,
  });

const isAdminPayload = (value: string | jwt.JwtPayload): value is AdminTokenPayload =>
  typeof value !== "string" && value.kind === "admin" && typeof value.adminId === "string";

/** Lets a request through only with a live session for an enabled admin. */
export const requireAdmin = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token: unknown = req.cookies?.[ADMIN_COOKIE];
    if (typeof token !== "string" || !token) {
      throw adminError("Admin sign-in required", 401);
    }
    let payload: string | jwt.JwtPayload;
    try {
      payload = jwt.verify(token, getAdminSecret());
    } catch (error: unknown) {
      if (error instanceof Error && error.message.startsWith("ADMIN_JWT_SECRET")) throw error;
      throw adminError("Your admin session has ended. Please sign in again.", 401);
    }
    if (!isAdminPayload(payload)) {
      throw adminError("Admin sign-in required", 401);
    }
    // Checked every time, so disabling an admin ends their session at once.
    const admin = await Admin.findOne({ _id: payload.adminId, isActive: true })
      .select("name email")
      .lean()
      .exec();
    if (!admin) {
      throw adminError("Admin sign-in required", 401);
    }
    (req as AdminRequest).admin = {
      id: admin._id.toString(),
      name: admin.name,
      email: admin.email,
    };
    next();
  } catch (error: unknown) {
    next(error);
  }
};
