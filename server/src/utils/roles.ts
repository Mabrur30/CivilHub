import { type UserRole } from "../models/User.model";
import {
  Organisation,
  type OrganisationService,
} from "../models/Organisation.model";

interface RoleError extends Error {
  statusCode: number;
}

const createRoleError = (message: string, statusCode: number): RoleError => {
  const error = new Error(message) as RoleError;
  error.statusCode = statusCode;
  return error;
};

/** Roles that offer services: engineers, developers and companies. */
export const PROVIDER_ROLES: UserRole[] = [
  "engineer",
  "developer",
  "organisation",
];

export const isProviderRole = (role: unknown): boolean =>
  role === "engineer" || role === "developer" || role === "organisation";

/** Anyone signed in can rent equipment. */
export const canRentEquipment = (role: unknown): boolean =>
  role === "client" ||
  role === "engineer" ||
  role === "developer" ||
  role === "organisation";

export const getOrganisationServices = async (
  userId: string,
): Promise<OrganisationService[]> => {
  const organisation = await Organisation.findOne({ user: userId })
    .select("services")
    .exec();
  return organisation?.services ?? [];
};

interface Actor {
  userId?: string;
  role?: UserRole;
}

/**
 * Engineers and developers can always take on project work. A company can
 * only when its profile says it does, so a plant-hire firm isn't shown
 * bidding tools.
 */
export const assertCanTakeProjects = async (
  user: Actor | undefined,
  deniedMessage = "Engineer access required",
): Promise<string> => {
  if (!user?.userId) throw createRoleError("Authentication required", 401);
  if (user.role === "engineer" || user.role === "developer") return user.userId;
  if (user.role === "organisation") {
    const services = await getOrganisationServices(user.userId);
    if (services.includes("projects")) return user.userId;
    throw createRoleError(
      "Your company profile doesn't offer project work. Turn it on in your company profile.",
      403,
    );
  }
  throw createRoleError(deniedMessage, 403);
};

/**
 * The cost estimator is a project-work tool: clients planning a build,
 * engineers, and companies that take on projects. A rental-only company
 * doesn't get it.
 */
export const assertCanUseCostEstimator = async (
  user: Actor | undefined,
): Promise<string> => {
  if (!user?.userId) throw createRoleError("Authentication required", 401);
  if (user.role === "client") return user.userId;
  if (user.role === "organisation") {
    const services = await getOrganisationServices(user.userId);
    if (!services.includes("projects")) {
      throw createRoleError(
        'The cost estimator is for project work. Turn on "Take on projects" in your company profile to use it.',
        403,
      );
    }
  }
  return assertCanTakeProjects(user);
};

/** Same rule for listing equipment: engineers, or companies that rent out machines. */
export const assertCanListEquipment = async (
  user: Actor | undefined,
): Promise<string> => {
  if (!user?.userId) throw createRoleError("Authentication required", 401);
  if (user.role === "engineer") return user.userId;
  if (user.role === "organisation") {
    const services = await getOrganisationServices(user.userId);
    if (services.includes("equipment")) return user.userId;
    throw createRoleError(
      "Your company profile doesn't offer equipment rental. Turn it on in your company profile.",
      403,
    );
  }
  throw createRoleError("Engineer or company access required", 403);
};

/** True if this user can be invited to bid or hired for a project. */
export const canUserTakeProjects = async (
  userId: string,
  role: UserRole,
): Promise<boolean> => {
  if (role === "engineer" || role === "developer") return true;
  if (role !== "organisation") return false;
  return (await getOrganisationServices(userId)).includes("projects");
};
