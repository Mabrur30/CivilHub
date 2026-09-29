import bcrypt from "bcryptjs";
import { type NextFunction, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Client } from "../models/Client.model";
import { Developer } from "../models/Developer.model";
import { Engineer } from "../models/Engineer.model";
import {
  Organisation,
  isOrganisationService,
  type OrganisationService,
} from "../models/Organisation.model";
import { User, type IUser, type UserRole } from "../models/User.model";
import { getProfilePhotoUrl } from "../utils/profilePhotos";
import { onlyDisciplines, parseDisciplines } from "../utils/disciplines";

export interface SignupRequestBody {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  /** Companies only: what they offer ("equipment", "projects" or both). */
  services?: unknown;
  /**
   * Engineers, and companies that take on projects: their main speciality
   * first, then up to two more, from the discipline list.
   */
  disciplines?: unknown;
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

const toPublicUser = async (user: IUser) => {
  const profilePhotoUrl = await getProfilePhotoUrl(user._id);
  // Companies see only the tools for what they offer, so the app needs these.
  const organisation =
    user.role === "organisation"
      ? await Organisation.findOne({ user: user._id })
          .select("services specialties")
          .exec()
      : null;
  // Providers without a speciality are prompted to choose one.
  let disciplines: string[] | undefined;
  if (user.role === "engineer") {
    disciplines =
      (await Engineer.findOne({ user: user._id }).select("disciplines").exec())
        ?.disciplines ?? [];
  } else if (user.role === "developer") {
    disciplines =
      (await Developer.findOne({ user: user._id }).select("disciplines").exec())
        ?.disciplines ?? [];
  } else if (user.role === "organisation") {
    disciplines = onlyDisciplines(organisation?.specialties);
  }

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    profilePhotoUrl,
    ...(user.role === "organisation" ? { services: organisation?.services ?? [] } : {}),
    ...(disciplines ? { disciplines } : {}),
  };
};

/** A company must say what it offers; duplicates are dropped. */
const parseServices = (value: unknown): OrganisationService[] => {
  const list: unknown[] = Array.isArray(value) ? value : [];
  if (list.length === 0 || !list.every(isOrganisationService)) {
    throw createAuthError(
      "Choose what your company does: rent out equipment, take on projects, or both",
      400,
    );
  }
  return [...new Set(list as OrganisationService[])];
};

export const signup = async (
  req: Request<Record<string, never>, unknown, SignupRequestBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { name, email, password, role, services, disciplines } = req.body;

    if (!name || !email || !password || !role) {
      throw createAuthError("All fields are required", 400);
    }

    if (
      role !== "client" &&
      role !== "engineer" &&
      role !== "developer" &&
      role !== "organisation"
    ) {
      throw createAuthError(
        "Role must be client, engineer, developer or organisation",
        400,
      );
    }
    const organisationServices =
      role === "organisation" ? parseServices(services) : [];
    // Engineers always need a speciality; a company only if it takes on
    // projects (a rental-only firm is found by its equipment instead).
    const needsSpeciality =
      role === "engineer" ||
      role === "developer" ||
      (role === "organisation" && organisationServices.includes("projects"));
    const chosenDisciplines = needsSpeciality
      ? (parseDisciplines(disciplines, { required: true }) ?? [])
      : (role === "organisation" ? parseDisciplines(disciplines) : undefined) ?? [];

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
    try {
      if (role === "client") {
        await Client.create({ user: user._id });
      } else if (role === "organisation") {
        await Organisation.create({
          user: user._id,
          services: organisationServices,
          specialties: chosenDisciplines,
        });
      } else if (role === "engineer") {
        await Engineer.create({
          user: user._id,
          disciplines: chosenDisciplines,
          certificates: [],
          portfolio: [],
        });
      } else {
        await Developer.create({
          user: user._id,
          disciplines: chosenDisciplines,
          portfolio: [],
        });
      }
    } catch (profileError: unknown) {
      await User.deleteOne({ _id: user._id });
      throw profileError;
    }

    setAuthCookie(res, user);
    res.status(201).json(await toPublicUser(user));
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
    res.status(200).json(await toPublicUser(user));
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

    res.status(200).json(await toPublicUser(user));
  } catch (error: unknown) {
    next(error);
  }
};

// ============ Account settings ============

export interface UpdateNameBody {
  name?: unknown;
}

export interface UpdateEmailBody {
  email?: unknown;
  currentPassword?: unknown;
}

export interface UpdatePasswordBody {
  currentPassword?: unknown;
  newPassword?: unknown;
}

const NAME_MIN = 2;
const NAME_MAX = 80;
const PASSWORD_MIN = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The signed-in user with their password hash, for changes that need it. */
const loadSelf = async (req: AuthenticatedRequest): Promise<IUser> => {
  if (!req.user?.userId) {
    throw createAuthError("Authentication required", 401);
  }
  const user = await User.findById(req.user.userId).select("+passwordHash").exec();
  if (!user) {
    throw createAuthError("User not found", 404);
  }
  return user;
};

// Email and password changes are sensitive, so they ask for the current
// password even though the user is signed in.
const assertCurrentPassword = async (user: IUser, value: unknown): Promise<void> => {
  const matches =
    typeof value === "string" && value.length > 0
      ? await bcrypt.compare(value, user.passwordHash)
      : false;
  if (!matches) {
    throw createAuthError("Your current password isn't right", 401);
  }
};

export const updateMyName = async (
  req: AuthenticatedRequest<UpdateNameBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = await loadSelf(req);
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      throw createAuthError(
        `Your name must be ${NAME_MIN} to ${NAME_MAX} characters`,
        400,
      );
    }
    user.name = name;
    await user.save();
    res.status(200).json(await toPublicUser(user));
  } catch (error: unknown) {
    next(error);
  }
};

export const updateMyEmail = async (
  req: AuthenticatedRequest<UpdateEmailBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = await loadSelf(req);
    const email =
      typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!EMAIL_PATTERN.test(email)) {
      throw createAuthError("Enter a valid email address", 400);
    }
    await assertCurrentPassword(user, req.body.currentPassword);
    if (email === user.email) {
      res.status(200).json(await toPublicUser(user));
      return;
    }
    if (await User.exists({ email, _id: { $ne: user._id } })) {
      throw createAuthError("Another account already uses that email", 409);
    }
    user.email = email;
    await user.save();
    res.status(200).json(await toPublicUser(user));
  } catch (error: unknown) {
    next(error);
  }
};

export const updateMyPassword = async (
  req: AuthenticatedRequest<UpdatePasswordBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = await loadSelf(req);
    const newPassword =
      typeof req.body.newPassword === "string" ? req.body.newPassword : "";
    if (newPassword.length < PASSWORD_MIN) {
      throw createAuthError(
        `Your new password must be at least ${PASSWORD_MIN} characters`,
        400,
      );
    }
    await assertCurrentPassword(user, req.body.currentPassword);
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.status(200).json(await toPublicUser(user));
  } catch (error: unknown) {
    next(error);
  }
};
