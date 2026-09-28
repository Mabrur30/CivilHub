import { type NextFunction, type Response } from "express";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import {
  Organisation,
  TEAM_SIZES,
  isOrganisationService,
  type IOrganisation,
  type OrganisationPortfolioItem,
  type OrganisationService,
  type TeamSize,
} from "../models/Organisation.model";
import { User } from "../models/User.model";
import { deleteCloudinaryAsset, uploadBuffer } from "../utils/cloudinaryUpload";
import { onlyDisciplines, parseDisciplines } from "../utils/disciplines";

interface OrganisationError extends Error {
  statusCode: number;
}

export interface UpdateOrganisationBody {
  name?: unknown;
  services?: unknown;
  about?: unknown;
  location?: unknown;
  serviceAreas?: unknown;
  specialties?: unknown;
  tradeLicenceNo?: unknown;
  yearFounded?: unknown;
  teamSize?: unknown;
  website?: unknown;
  phone?: unknown;
}

const createOrganisationError = (
  message: string,
  statusCode: number,
): OrganisationError => {
  const error = new Error(message) as OrganisationError;
  error.statusCode = statusCode;
  return error;
};

const LIST_LIMIT = 12;

/** The signed-in company's profile; every company gets one at signup. */
const requireOrganisation = async (
  req: AuthenticatedRequest,
): Promise<IOrganisation> => {
  if (!req.user?.userId || req.user.role !== "organisation") {
    throw createOrganisationError("Company access required", 403);
  }
  const organisation = await Organisation.findOne({
    user: req.user.userId,
  }).exec();
  if (!organisation) {
    throw createOrganisationError("Company profile not found", 404);
  }
  return organisation;
};

export interface OrganisationProfileResponse {
  userId: string;
  name: string;
  services: OrganisationService[];
  logoUrl: string | null;
  about: string;
  location: string;
  serviceAreas: string[];
  specialties: string[];
  tradeLicenceNo: string;
  yearFounded: number | null;
  teamSize: TeamSize | null;
  website: string;
  phone: string;
  portfolio: Array<{
    id: string;
    title: string;
    description: string;
    imageUrl: string;
    uploadedAt: string;
  }>;
}

export const toOrganisationProfile = (
  organisation: IOrganisation,
  name: string,
): OrganisationProfileResponse => ({
  userId: organisation.user.toString(),
  name,
  services: organisation.services,
  logoUrl: organisation.logo?.url ?? null,
  about: organisation.about ?? "",
  location: organisation.location ?? "",
  serviceAreas: organisation.serviceAreas ?? [],
  // Older free-text entries that aren't disciplines are left out.
  specialties: onlyDisciplines(organisation.specialties),
  tradeLicenceNo: organisation.tradeLicenceNo ?? "",
  yearFounded: organisation.yearFounded ?? null,
  teamSize: organisation.teamSize ?? null,
  website: organisation.website ?? "",
  phone: organisation.phone ?? "",
  portfolio: organisation.portfolio.map((item) => ({
    id: item._id.toString(),
    title: item.title,
    description: item.description,
    imageUrl: item.imageUrl,
    uploadedAt: item.uploadedAt.toISOString(),
  })),
});

// ============ Field parsing ============

const optionalText = (
  value: unknown,
  label: string,
  max: number,
): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw createOrganisationError(`${label} must be text`, 400);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw createOrganisationError(
      `${label} must be ${max} characters or fewer`,
      400,
    );
  }
  return trimmed;
};

const optionalList = (value: unknown, label: string): string[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw createOrganisationError(`${label} must be a list`, 400);
  }
  const items = [
    ...new Set(
      (value as string[]).map((item) => item.trim()).filter(Boolean),
    ),
  ];
  if (items.length > LIST_LIMIT) {
    throw createOrganisationError(
      `Add up to ${LIST_LIMIT} ${label.toLowerCase()}`,
      400,
    );
  }
  if (items.some((item) => item.length > 60)) {
    throw createOrganisationError(
      `Keep each of the ${label.toLowerCase()} to 60 characters`,
      400,
    );
  }
  return items;
};

const parseYear = (value: unknown): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const year = Number(value);
  const thisYear = new Date().getFullYear();
  if (!Number.isInteger(year) || year < 1900 || year > thisYear) {
    throw createOrganisationError(
      `Year founded must be between 1900 and ${thisYear}`,
      400,
    );
  }
  return year;
};

const parseTeamSize = (value: unknown): TeamSize | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (!(TEAM_SIZES as readonly unknown[]).includes(value)) {
    throw createOrganisationError("Choose a team size from the list", 400);
  }
  return value as TeamSize;
};

const parseServices = (value: unknown): OrganisationService[] | undefined => {
  if (value === undefined) return undefined;
  const list: unknown[] = Array.isArray(value) ? value : [];
  if (list.length === 0 || !list.every(isOrganisationService)) {
    throw createOrganisationError(
      "Choose what your company does: rent out equipment, take on projects, or both",
      400,
    );
  }
  return [...new Set(list as OrganisationService[])];
};

const setOrUnset = <K extends keyof IOrganisation>(
  organisation: IOrganisation,
  key: K,
  value: IOrganisation[K] | null | undefined,
): void => {
  if (value === undefined) return;
  organisation.set(key, value === null || value === "" ? undefined : value);
};

// ============ Handlers ============

export const getMyOrganisationProfile = async (
  req: AuthenticatedRequest,
  res: Response<OrganisationProfileResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const organisation = await requireOrganisation(req);
    const user = await User.findById(req.user.userId).select("name").exec();
    res.status(200).json(toOrganisationProfile(organisation, user?.name ?? ""));
  } catch (error: unknown) {
    next(error);
  }
};

export const updateMyOrganisationProfile = async (
  req: AuthenticatedRequest<UpdateOrganisationBody>,
  res: Response<OrganisationProfileResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const organisation = await requireOrganisation(req);
    const body = req.body ?? {};

    const name = optionalText(body.name, "Company name", 120);
    if (name !== undefined && !name) {
      throw createOrganisationError("Company name can't be empty", 400);
    }
    const services = parseServices(body.services);
    const serviceAreas = optionalList(body.serviceAreas, "Service areas");
    const specialties = parseDisciplines(body.specialties);

    if (services) organisation.services = services;
    if (serviceAreas) organisation.serviceAreas = serviceAreas;
    if (specialties) organisation.specialties = specialties;
    setOrUnset(organisation, "about", optionalText(body.about, "About", 1000));
    setOrUnset(organisation, "location", optionalText(body.location, "Location", 160));
    setOrUnset(
      organisation,
      "tradeLicenceNo",
      optionalText(body.tradeLicenceNo, "Trade licence number", 60),
    );
    setOrUnset(organisation, "website", optionalText(body.website, "Website", 200));
    setOrUnset(organisation, "phone", optionalText(body.phone, "Phone", 30));
    setOrUnset(organisation, "yearFounded", parseYear(body.yearFounded));
    setOrUnset(organisation, "teamSize", parseTeamSize(body.teamSize));
    await organisation.save();

    const user = await User.findById(req.user.userId).select("name").exec();
    if (user && name) {
      user.name = name;
      await user.save();
    }

    res
      .status(200)
      .json(toOrganisationProfile(organisation, user?.name ?? name ?? ""));
  } catch (error: unknown) {
    next(error);
  }
};

const getFile = (req: AuthenticatedRequest): Express.Multer.File => {
  if (!req.file) {
    throw createOrganisationError("A file is required", 400);
  }
  return req.file;
};

export const uploadOrganisationLogo = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const organisation = await requireOrganisation(req);
    const file = getFile(req);
    const result = await uploadBuffer(file.buffer, {
      folder: "civilhub/company-logos",
      resource_type: "image",
    });

    const previous = organisation.logo;
    organisation.logo = {
      url: result.secure_url,
      fileUrl: result.secure_url,
      publicId: result.public_id,
      resourceType: "image",
    };
    await organisation.save();
    if (previous?.publicId) {
      await deleteCloudinaryAsset(previous.publicId, previous.resourceType);
    }

    res.status(200).json({ logoUrl: result.secure_url });
  } catch (error: unknown) {
    next(error);
  }
};

export const uploadOrganisationPortfolioItem = async (
  req: AuthenticatedRequest<{ title?: string; description?: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const organisation = await requireOrganisation(req);
    const file = getFile(req);
    const title = req.body.title?.trim();
    const description = req.body.description?.trim();
    if (!title || !description) {
      throw createOrganisationError(
        "Portfolio title and description are required",
        400,
      );
    }

    const result = await uploadBuffer(file.buffer, {
      folder: "civilhub/portfolio",
      resource_type: "image",
    });
    organisation.portfolio.push({
      title,
      description,
      imageUrl: result.secure_url,
      fileUrl: result.secure_url,
      publicId: result.public_id,
      resourceType: "image",
      uploadedAt: new Date(),
    } as OrganisationPortfolioItem);
    await organisation.save();

    const user = await User.findById(req.user.userId).select("name").exec();
    res
      .status(201)
      .json(toOrganisationProfile(organisation, user?.name ?? ""));
  } catch (error: unknown) {
    next(error);
  }
};

export const deleteOrganisationPortfolioItem = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const organisation = await requireOrganisation(req);
    const { itemId } = req.params as unknown as { itemId?: string };
    const item = itemId ? organisation.portfolio.id(itemId) : null;
    if (!item) {
      throw createOrganisationError("Portfolio item not found", 404);
    }

    await deleteCloudinaryAsset(item.publicId, item.resourceType);
    item.deleteOne();
    await organisation.save();

    const user = await User.findById(req.user.userId).select("name").exec();
    res
      .status(200)
      .json(toOrganisationProfile(organisation, user?.name ?? ""));
  } catch (error: unknown) {
    next(error);
  }
};
