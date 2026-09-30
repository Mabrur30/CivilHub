import { type NextFunction, type Response } from "express";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Organisation } from "../models/Organisation.model";
import { User } from "../models/User.model";
import {
  type VerificationDocument,
  type VerificationDocumentKind,
  Verification,
} from "../models/Verification.model";
import { uploadBuffer } from "../utils/cloudinaryUpload";
import { isProviderRole } from "../utils/roles";
import { deleteDocuments, toOwnVerificationView } from "../utils/verification";

/**
 * An engineer or company asks CivilHub to verify them. Engineers send their
 * IEB membership number and certificate plus their NID; companies send their
 * trade licence plus the account holder's NID. The files are private.
 */

interface StatusError extends Error {
  statusCode: number;
}

const verificationError = (message: string, statusCode: number): StatusError => {
  const error = new Error(message) as StatusError;
  error.statusCode = statusCode;
  return error;
};

const requireProvider = (req: AuthenticatedRequest): string => {
  if (!isProviderRole(req.user.role)) {
    throw verificationError("Only engineers and companies can be verified.", 403);
  }
  return req.user.userId;
};

/** IEB numbers are a grade letter and digits: A/1234, M/12345 or F/1234. */
const IEB_NUMBER = /^([AMF])\s*\/?\s*(\d{3,7})$/;

export const normaliseIebNumber = (value: unknown): string | null => {
  const match = typeof value === "string" ? IEB_NUMBER.exec(value.trim().toUpperCase()) : null;
  return match ? `${match[1]}/${match[2]}` : null;
};

type UploadedFiles = Partial<Record<"ieb" | "licence" | "nid", Express.Multer.File[]>>;

const filesOf = (req: AuthenticatedRequest): UploadedFiles =>
  req.files && !Array.isArray(req.files) ? (req.files as UploadedFiles) : {};

const uploadPrivate = async (
  file: Express.Multer.File,
  kind: VerificationDocumentKind,
): Promise<VerificationDocument> => {
  const isPdf = file.mimetype.toLowerCase().startsWith("application/pdf");
  const name = file.originalname.trim() || (isPdf ? "document.pdf" : "document");
  const result = await uploadBuffer(file.buffer, {
    folder: "civilhub/verification",
    type: "authenticated",
    resource_type: isPdf ? "raw" : "image",
    ...(isPdf ? { use_filename: true, unique_filename: true, filename_override: name } : {}),
  });
  return {
    kind,
    publicId: result.public_id,
    resourceType: isPdf ? "raw" : "image",
    format: result.format ?? (isPdf ? "pdf" : ""),
    originalName: name.slice(0, 200),
    uploadedAt: new Date(),
  };
};

export const getMyVerification = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireProvider(req);
    const [verification, user, organisation] = await Promise.all([
      Verification.findOne({ user: userId }).exec(),
      User.findById(userId).select("verifiedAt").lean().exec(),
      req.user.role === "organisation"
        ? Organisation.findOne({ user: userId }).select("tradeLicenceNo").lean().exec()
        : Promise.resolve(null),
    ]);
    res.json({
      kind: req.user.role === "organisation" ? "organisation" : "engineer",
      verifiedAt: user?.verifiedAt?.toISOString() ?? null,
      profileTradeLicenceNo: organisation?.tradeLicenceNo ?? null,
      verification: toOwnVerificationView(verification),
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const submitVerification = async (
  req: AuthenticatedRequest<{ iebNumber?: unknown; tradeLicenceNo?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireProvider(req);
    const isCompany = req.user.role === "organisation";

    const existing = await Verification.findOne({ user: userId }).exec();
    if (existing?.status === "pending") {
      throw verificationError("Your details are already with CivilHub for review.", 409);
    }
    if (existing?.status === "verified") {
      throw verificationError("You're already verified.", 409);
    }

    const files = filesOf(req);
    const nid = files.nid ?? [];
    let iebNumber: string | undefined;
    let tradeLicenceNo: string | undefined;
    let main: { file: Express.Multer.File; kind: VerificationDocumentKind } | undefined;

    if (isCompany) {
      tradeLicenceNo = typeof req.body.tradeLicenceNo === "string" ? req.body.tradeLicenceNo.trim() : "";
      if (tradeLicenceNo.length < 3 || tradeLicenceNo.length > 60) {
        throw verificationError("Enter your trade licence number as it's printed on the licence.", 400);
      }
      const licence = files.licence?.[0];
      if (!licence) throw verificationError("Add a scan or photo of your trade licence.", 400);
      main = { file: licence, kind: "trade_licence" };
    } else {
      iebNumber = normaliseIebNumber(req.body.iebNumber) ?? undefined;
      if (!iebNumber) {
        throw verificationError("Enter your IEB membership number, like M/12345.", 400);
      }
      const certificate = files.ieb?.[0];
      if (!certificate) throw verificationError("Add your IEB membership certificate.", 400);
      main = { file: certificate, kind: "ieb_certificate" };
    }
    if (nid.length === 0) {
      throw verificationError("Add your national ID card (NID), both sides if you can.", 400);
    }

    const results = await Promise.allSettled([
      uploadPrivate(main.file, main.kind),
      ...nid.map((file) => uploadPrivate(file, "nid")),
    ]);
    const uploaded = results
      .filter((result): result is PromiseFulfilledResult<VerificationDocument> => result.status === "fulfilled")
      .map((result) => result.value);
    if (uploaded.length !== results.length) {
      await deleteDocuments(uploaded);
      throw verificationError("A file didn't upload. Please try again.", 422);
    }

    const user = await User.findById(userId).select("name").lean().exec();
    if (isCompany) {
      await Organisation.updateOne({ user: userId }, { $set: { tradeLicenceNo } }).exec();
    }

    const previousDocuments = existing?.documents ?? [];
    const verification = await Verification.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          kind: isCompany ? "organisation" : "engineer",
          status: "pending",
          nameAtSubmission: user?.name ?? "",
          documents: uploaded,
          submittedAt: new Date(),
          ...(isCompany ? { tradeLicenceNo } : { iebNumber }),
        },
        $unset: {
          note: 1,
          reviewedAt: 1,
          reviewedBy: 1,
          licenceExpiresAt: 1,
          expiryReminderSentAt: 1,
          ...(isCompany ? { iebNumber: 1 } : { tradeLicenceNo: 1 }),
        },
      },
      { upsert: true, returnDocument: "after" },
    ).exec();
    await deleteDocuments(previousDocuments);

    res.status(201).json({ verification: toOwnVerificationView(verification) });
  } catch (error: unknown) {
    next(error);
  }
};
