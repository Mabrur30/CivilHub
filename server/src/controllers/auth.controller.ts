import bcrypt from "bcryptjs";
import { type NextFunction, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Client } from "../models/Client.model";
import { Engineer } from "../models/Engineer.model";
import { User, type IUser, type UserRole } from "../models/User.model";

export interface SignupRequestBody {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface LoginRequestBody {
  email: string;
  password: string;
}

interface JwtPayload {
  userId: string;
  role: UserRole;
}

interface AuthError extends Error {
  statusCode: number;
}

const COOKIE_NAME = "civilhub_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const createAuthError = (message: string, statusCode: number): AuthError => {
  const error = new Error(message) as AuthError;
  error.statusCode = statusCode;
  return error;
};

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return secret;
};

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: COOKIE_MAX_AGE,
});

const setAuthCookie = (res: Response, user: IUser): void => {
  const payload: JwtPayload = {
    userId: user._id.toString(),
    role: user.role,
  };
  const token = jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });

  res.cookie(COOKIE_NAME, token, getCookieOptions());
};

const toPublicUser = (user: IUser) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
});

export const signup = async (
  req: Request<Record<string, never>, unknown, SignupRequestBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      throw createAuthError("All fields are required", 400);
    }

    if (role !== "client" && role !== "engineer") {
      throw createAuthError("Role must be client or engineer", 400);
    }

    if (password.length < 8) {
      throw createAuthError("Password must be at least 8 characters", 400);
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      throw createAuthError("Email is already registered", 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role,
    });
    if (role === "client") {
      await Client.create({ user: user._id });
    } else {
      await Engineer.create({
        user: user._id,
        certificates: [],
        portfolio: [],
      });
    }

    setAuthCookie(res, user);
    res.status(201).json(toPublicUser(user));
  } catch (error: unknown) {
    next(error);
  }
};

export const login = async (
  req: Request<Record<string, never>, unknown, LoginRequestBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw createAuthError("Email and password are required", 400);
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+passwordHash");
    const isPasswordValid = user
      ? await bcrypt.compare(password, user.passwordHash)
      : false;

    if (!user || !isPasswordValid) {
      throw createAuthError("Invalid credentials", 401);
    }

    setAuthCookie(res, user);
    res.status(200).json(toPublicUser(user));
  } catch (error: unknown) {
    next(error);
  }
};

export const logout = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    res.clearCookie(COOKIE_NAME, getCookieOptions());
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error: unknown) {
    next(error);
  }
};

export const getCurrentUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      throw createAuthError("Authentication required", 401);
    }

    const user = await User.findById(req.user.userId);

    if (!user) {
      throw createAuthError("User not found", 404);
    }

    res.status(200).json(toPublicUser(user));
  } catch (error: unknown) {
    next(error);
  }
};
