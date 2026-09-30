import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { getAccountStanding, isRestricted } from "../utils/accountStatus";
import { isBlockedByMe, isBlockedEitherWay } from "../utils/blocks";
import { Connection } from "../models/Connection.model";
import { Client } from "../models/Client.model";
import { Engineer } from "../models/Engineer.model";
import { Equipment } from "../models/Equipment.model";
import { Organisation } from "../models/Organisation.model";
import { toOrganisationProfile } from "./organisation.controller";
import { type IProject, Project } from "../models/Project.model";
import {
  ProjectPhase,
  type ProjectPhaseStatus,
} from "../models/ProjectPhase.model";
import { type IUser, User, type UserRole } from "../models/User.model";
import { Bid } from "../models/Bid.model";
import { getProfilePhotoMap } from "../utils/profilePhotos";
import { getProviderRatings, type ProviderRatings } from "../utils/providerRatings";
import { getCustomerRating } from "./customerReview.controller";
import type { ConnectionViewStatus } from "./network.controller";
import { budgetLabel } from "../utils/money";

interface UserParams {
  userId?: string;
}
interface UserError extends Error {
  statusCode: number;
}

const createUserError = (message: string, statusCode: number): UserError => {
  const error = new Error(message) as UserError;
  error.statusCode = statusCode;
  return error;
};

const getUserId = (req: AuthenticatedRequest): string => {
  if (!req.user?.userId) throw createUserError("Authentication required", 401);
  return req.user.userId;
};

const getParams = (req: AuthenticatedRequest): UserParams =>
  req.params as unknown as UserParams;

/** The headline rating plus the split by kind, for a provider's profile. */
const toRatingFields = (ratings: ProviderRatings) => ({
  rating: ratings.headline.rating,
  reviewCount: ratings.headline.count,
  ratingKind: ratings.headline.kind,
  ratings: {
    project: ratings.project,
    equipment: ratings.equipment,
  },
});

// Only how many bids were won: amounts are the client's private deal.
const getAcceptedBidCount = (userId: string): Promise<number> =>
  Bid.countDocuments({ engineer: userId, status: "accepted" }).exec();

const getEngineerDerivedLocation = async (
  userId: string,
): Promise<{
  derivedLocation: string | null;
  completedProjectCount: number;
}> => {
  if (!Types.ObjectId.isValid(userId)) {
    return { derivedLocation: null, completedProjectCount: 0 };
  }

  const engineerId = new Types.ObjectId(userId);
  const rows = await Project.aggregate<{
    _id: string;
    projectCount: number;
  }>([
    {
      $match: {
        assignedEngineer: engineerId,
        status: "completed",
        location: { $exists: true, $nin: [null, ""] },
      },
    },
    {
      $group: {
        _id: "$location",
        projectCount: { $sum: 1 },
      },
    },
    { $sort: { projectCount: -1, _id: 1 } },
  ]).exec();

  const completedProjectCount = rows.reduce(
    (total, row) => total + row.projectCount,
    0,
  );

  return {
    derivedLocation: rows[0]?._id ?? null,
    completedProjectCount,
  };
};

const getConnectionsCount = async (userId: string): Promise<number> =>
  Connection.countDocuments({
    $or: [{ requester: userId }, { recipient: userId }],
    status: "accepted",
  }).exec();

interface ConnectionDetails {
  status: ConnectionViewStatus;
  connectionId: string | null;
  /** The viewer has blocked this person; the profile offers Unblock. */
  blockedByMe: boolean;
  /** Either side blocked the other, so there's nothing to connect or message. */
  blockedEitherWay: boolean;
}

const getConnectionDetails = async (
  requester: string,
  target: string,
): Promise<ConnectionDetails> => {
  const isOther = requester !== target;
  const [blockedByMe, blockedEitherWay, details] = await Promise.all([
    isOther ? isBlockedByMe(requester, target) : false,
    isOther ? isBlockedEitherWay(requester, target) : false,
    getConnectionStatusFor(requester, target),
  ]);
  return { ...details, blockedByMe, blockedEitherWay };
};

const getConnectionStatusFor = async (
  requester: string,
  target: string,
): Promise<{ status: ConnectionViewStatus; connectionId: string | null }> => {
  if (requester === target) return { status: "connected", connectionId: null };
  const connection = await Connection.findOne({
    $or: [
      { requester, recipient: target },
      { requester: target, recipient: requester },
    ],
  }).exec();
  if (!connection) return { status: "not_connected", connectionId: null };
  if (connection.status === "accepted") {
    return { status: "connected", connectionId: connection._id.toString() };
  }
  if (connection.status === "pending")
    return {
      status:
        connection.requester.toString() === requester
          ? "pending_sent"
          : "pending_received",
      connectionId: connection._id.toString(),
    };
  return { status: "not_connected", connectionId: null };
};

const HIRED_STATUSES = new Set(["active", "in-progress", "completed"]);
const REVIEWED_PHASE_STATUSES: ProjectPhaseStatus[] = [
  "awaiting_approval",
  "completed",
];
const DAY_MS = 864e5;

/** The middle value, to one decimal place; null when there's nothing to measure. */
const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 1
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(value * 10) / 10;
};
const OPEN_PROJECT_LIMIT = 10;
const COMPLETED_PROJECT_LIMIT = 6;

const projectTitle = (project: IProject): string =>
  project.title ?? project.name ?? "Untitled project";

const LISTING_LIMIT = 6;

/** Machines someone has up for rent right now. */
const getActiveListings = async (userId: Types.ObjectId) => {
  const listings = await Equipment.find({ owner: userId, status: "active" })
    .select("_id title category dailyRate location photos quantity")
    .sort({ createdAt: -1 })
    .limit(LISTING_LIMIT)
    .exec();
  return listings.map((item) => ({
    id: item._id.toString(),
    title: item.title,
    category: item.category,
    dailyRate: item.dailyRate,
    location: item.location,
    quantity: item.quantity ?? 1,
    photoUrl: item.photos[0]?.url ?? null,
  }));
};

// Delivered work as a profile shows it. The price stays between the client
// and whoever delivered it, so it isn't included.
const toDeliveredProject = (project: IProject) => ({
  id: project._id.toString(),
  title: projectTitle(project),
  category: project.category ?? "General",
  location: project.location ?? null,
  completedAt: (
    project.completedAt ??
    project.updatedAt ??
    project.createdAt
  ).toISOString(),
});

// A company's page: who they are and what they offer (from their own
// profile), plus proof from the platform: rating, delivered projects and the
// machines they have for rent right now.
const buildOrganisationPublicProfile = async (
  user: IUser,
  requesterId: string,
  connection: ConnectionDetails,
  connectionsCount: number,
) => {
  const userId = user._id.toString();
  const [organisation, ratings, completedWork, equipment] = await Promise.all([
    Organisation.findOne({ user: user._id }).exec(),
    getProviderRatings(userId),
    Project.find({ assignedEngineer: user._id, status: "completed" })
      .select("_id title name category location completedAt updatedAt createdAt")
      .sort({ completedAt: -1, updatedAt: -1 })
      .limit(COMPLETED_PROJECT_LIMIT)
      .exec(),
    getActiveListings(user._id),
  ]);
  const details = organisation
    ? toOrganisationProfile(organisation, user.name)
    : null;
  // The phone number is private to the company itself.
  const profile =
    details && requesterId !== userId ? { ...details, phone: "" } : details;

  return {
    userId,
    name: user.name,
    role: user.role,
    memberSince: user.createdAt.toISOString(),
    profilePhotoUrl: profile?.logoUrl ?? null,
    bio: profile?.about ?? "",
    connectionsCount,
    connectionStatus: connection.status,
    connectionId: connection.connectionId,
    blockedByMe: connection.blockedByMe,
    blockedEitherWay: connection.blockedEitherWay,
    ...toRatingFields(ratings),
    company: profile,
    completedWork: completedWork.map(toDeliveredProject),
    equipment,
  };
};

// Everything an engineer weighs before bidding for this client: who they are,
// whether their briefs turn into hires, whether they pay what falls due, and
// what they have open right now. The figures are derived from project and
// payment records rather than typed in, so a client cannot inflate them.
const buildClientPublicProfile = async (
  user: IUser,
  requesterId: string,
  connection: ConnectionDetails,
  connectionsCount: number,
) => {
  const [client, projects] = await Promise.all([
    Client.findOne({ user: user._id }).exec(),
    Project.find({ client: user._id })
      .select(
        "_id title name description category location budgetRange budgetMin budgetMax status assignedEngineer postedDate targetStartDate completedAt paymentPlan createdAt updatedAt",
      )
      .sort({ postedDate: -1, createdAt: -1 })
      .exec(),
  ]);

  const hired = projects.filter(
    (project) => project.assignedEngineer || HIRED_STATUSES.has(project.status),
  );
  const openProjects = projects.filter(
    (project) => project.status === "open_for_bids",
  );
  const completedProjects = projects.filter(
    (project) => project.status === "completed",
  );

  const budgetMins = projects
    .map((project) => project.budgetMin)
    .filter((value): value is number => typeof value === "number");
  const budgetMaxes = projects
    .map((project) => project.budgetMax)
    .filter((value): value is number => typeof value === "number");

  const categoryCounts = new Map<string, number>();
  for (const project of hired) {
    const category = project.category?.trim();
    if (category) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
  }

  const hiredIds = hired.map((project) => project._id);
  const openIds = openProjects
    .slice(0, OPEN_PROJECT_LIMIT)
    .map((project) => project._id);
  const completedShown = completedProjects
    .sort(
      (a, b) =>
        (b.completedAt ?? b.updatedAt).getTime() -
        (a.completedAt ?? a.updatedAt).getTime(),
    )
    .slice(0, COMPLETED_PROJECT_LIMIT);
  const engineerIds = completedShown
    .map((project) => project.assignedEngineer)
    .filter((id): id is Types.ObjectId => Boolean(id));

  const [reviewedPhases, bidCounts, myBids, engineers, photos, customerRating] =
    await Promise.all([
      hiredIds.length > 0
        ? ProjectPhase.find({
            project: { $in: hiredIds },
            status: { $in: REVIEWED_PHASE_STATUSES },
            "submissions.0": { $exists: true },
          })
            .select("status completedAt submissions")
            .exec()
        : Promise.resolve([]),
      openIds.length > 0
        ? Bid.aggregate<{ _id: Types.ObjectId; count: number }>([
            { $match: { project: { $in: openIds } } },
            { $group: { _id: "$project", count: { $sum: 1 } } },
          ]).exec()
        : Promise.resolve([]),
      openIds.length > 0 && Types.ObjectId.isValid(requesterId)
        ? Bid.find({ project: { $in: openIds }, engineer: requesterId })
            .select("project status")
            .exec()
        : Promise.resolve([]),
      engineerIds.length > 0
        ? User.find({ _id: { $in: engineerIds } })
            .select("name")
            .exec()
        : Promise.resolve([]),
      getProfilePhotoMap([user._id, ...engineerIds]),
      getCustomerRating(user._id),
    ]);

  // How long this client takes to approve handed-over work, and whether any
  // is sitting unreviewed. Only phases handed over with a submission count,
  // since that's when the client's clock starts.
  const approvalDays = reviewedPhases
    .filter((phase) => phase.status === "completed" && phase.completedAt)
    .map((phase) => {
      const handedOver = phase.submissions[phase.submissions.length - 1].submittedAt;
      return Math.max(0, ((phase.completedAt as Date).getTime() - handedOver.getTime()) / DAY_MS);
    });
  const weekAgo = Date.now() - 7 * DAY_MS;
  const phasesWaitingOverWeek = reviewedPhases.filter(
    (phase) =>
      phase.status === "awaiting_approval" &&
      phase.submissions[phase.submissions.length - 1].submittedAt.getTime() < weekAgo,
  ).length;

  const bidCountByProject = new Map(
    bidCounts.map((row) => [row._id.toString(), row.count]),
  );
  const myBidByProject = new Map(
    myBids.map((bid) => [bid.project.toString(), bid.status]),
  );
  const engineerNames = new Map(
    engineers.map((engineer) => [engineer._id.toString(), engineer.name]),
  );

  return {
    userId: user._id.toString(),
    name: user.name,
    role: user.role,
    profilePhotoUrl: photos.get(user._id.toString()) ?? null,
    bio: client?.bio ?? "",
    companyName: client?.companyName ?? "",
    clientType: client?.clientType ?? null,
    location: client?.location?.trim() || null,
    memberSince: user.createdAt.toISOString(),
    completedProjects: completedProjects.length,
    connectionStatus: connection.status,
    connectionId: connection.connectionId,
    blockedByMe: connection.blockedByMe,
    blockedEitherWay: connection.blockedEitherWay,
    connectionsCount,
    rating: customerRating.rating,
    reviewCount: customerRating.reviewCount,
    stats: {
      projectsPosted: projects.length,
      activeProjects: projects.filter(
        (project) =>
          project.status === "active" || project.status === "in-progress",
      ).length,
      completedProjects: completedProjects.length,
      openProjects: openProjects.length,
      hiredProjects: hired.length,
      approvalDaysMedian: median(approvalDays),
      approvalsMeasured: approvalDays.length,
      phasesWaitingOverWeek,
      budgetMin: budgetMins.length > 0 ? Math.min(...budgetMins) : null,
      budgetMax: budgetMaxes.length > 0 ? Math.max(...budgetMaxes) : null,
      topCategories: [...categoryCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 4)
        .map(([category]) => category),
    },
    openProjectsList: openProjects.slice(0, OPEN_PROJECT_LIMIT).map((project) => ({
      id: project._id.toString(),
      title: projectTitle(project),
      description: project.description ?? "",
      category: project.category ?? "General",
      location: project.location ?? null,
      budgetRange: budgetLabel(project),
      postedDate: (project.postedDate ?? project.createdAt).toISOString(),
      targetStartDate: project.targetStartDate?.toISOString() ?? null,
      bidCount: bidCountByProject.get(project._id.toString()) ?? 0,
      myBidStatus: myBidByProject.get(project._id.toString()) ?? null,
    })),
    completedWork: completedShown.map((project) => {
      const engineerId = project.assignedEngineer?.toString() ?? null;
      return {
        id: project._id.toString(),
        title: projectTitle(project),
        category: project.category ?? "General",
        location: project.location ?? null,
        completedAt: (
          project.completedAt ??
          project.updatedAt ??
          project.createdAt
        ).toISOString(),
        engineer:
          engineerId && engineerNames.has(engineerId)
            ? {
                id: engineerId,
                name: engineerNames.get(engineerId) as string,
                profilePhotoUrl: photos.get(engineerId) ?? null,
              }
            : null,
      };
    }),
  };
};

export const getPublicProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const requesterId = getUserId(req);
    const { userId } = getParams(req);
    if (!userId || !Types.ObjectId.isValid(userId)) {
      throw createUserError("User not found", 404);
    }
    const user = await User.findById(userId)
      .select("name role createdAt")
      .exec();
    // Suspended and banned accounts are hidden, the same as a missing one.
    if (!user || isRestricted(await getAccountStanding(userId))) {
      throw createUserError("User not found", 404);
    }
    const connection = await getConnectionDetails(requesterId, userId);
    const connectionsCount = await getConnectionsCount(userId);

    if (user.role === "engineer") {
      const engineer = await Engineer.findOne({ user: user._id }).exec();
      const [ratings, acceptedBidCount, derivedLocationStats, completedWork, equipment] =
        await Promise.all([
          getProviderRatings(user._id.toString()),
          getAcceptedBidCount(user._id.toString()),
          getEngineerDerivedLocation(user._id.toString()),
          Project.find({ assignedEngineer: user._id, status: "completed" })
            .select("_id title name category location completedAt updatedAt createdAt")
            .sort({ completedAt: -1, updatedAt: -1 })
            .limit(12)
            .exec(),
          getActiveListings(user._id),
        ]);

      res.status(200).json({
        userId: user._id.toString(),
        name: user.name,
        role: user.role,
        memberSince: user.createdAt.toISOString(),
        profilePhotoUrl: engineer?.profilePhoto?.url ?? null,
        bio: engineer?.bio ?? "",
        disciplines: engineer?.disciplines ?? [],
        connectionsCount,
        portfolio:
          engineer?.portfolio.map((item) => ({
            title: item.title,
            description: item.description,
            imageUrl: item.imageUrl,
            uploadedAt: item.uploadedAt.toISOString(),
          })) ?? [],
        // Anyone signed in can open a certificate and check it themselves;
        // CivilHub doesn't verify them yet.
        certificates:
          engineer?.certificates.map((certificate) => ({
            title: certificate.title,
            uploadedAt: certificate.uploadedAt.toISOString(),
            fileUrl: certificate.fileUrl,
            resourceType: certificate.resourceType,
          })) ?? [],
        connectionStatus: connection.status,
        connectionId: connection.connectionId,
        blockedByMe: connection.blockedByMe,
        blockedEitherWay: connection.blockedEitherWay,
        ...toRatingFields(ratings),
        startingRateMin:
          typeof engineer?.startingRateMin === "number"
            ? engineer.startingRateMin
            : null,
        startingRateMax:
          typeof engineer?.startingRateMax === "number"
            ? engineer.startingRateMax
            : null,
        location: engineer?.location?.trim() ? engineer.location.trim() : null,
        education: (engineer?.education ?? []).map((entry) => ({
          id: entry._id.toString(),
          institution: entry.institution?.trim() || null,
          degree: entry.degree?.trim() || null,
          fieldOfStudy: entry.fieldOfStudy?.trim() || null,
          graduationYear:
            typeof entry.graduationYear === "number"
              ? entry.graduationYear
              : null,
        })),
        experience: (engineer?.experience ?? []).map((entry) => ({
          id: entry._id.toString(),
          title: entry.title?.trim() || null,
          organization: entry.organization?.trim() || null,
          startYear:
            typeof entry.startYear === "number" ? entry.startYear : null,
          endYear: typeof entry.endYear === "number" ? entry.endYear : null,
          description: entry.description?.trim() || null,
        })),
        acceptedBidCount,
        derivedLocation: derivedLocationStats.derivedLocation,
        completedLocationProjectCount:
          derivedLocationStats.completedProjectCount,
        completedWork: completedWork.map(toDeliveredProject),
        equipment,
      });
      return;
    }

    if (user.role === "organisation") {
      res
        .status(200)
        .json(
          await buildOrganisationPublicProfile(
            user,
            requesterId,
            connection,
            connectionsCount,
          ),
        );
      return;
    }

    res
      .status(200)
      .json(
        await buildClientPublicProfile(
          user,
          requesterId,
          connection,
          connectionsCount,
        ),
      );
  } catch (error: unknown) {
    next(error);
  }
};
