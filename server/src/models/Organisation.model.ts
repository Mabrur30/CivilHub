import { Document, Model, Schema, Types, model } from "mongoose";

/**
 * What a company does on CivilHub. It decides which tools it gets:
 * "equipment" lists machines for rent, "projects" bids on and runs projects.
 * Renting equipment is open to every company.
 */
export const ORGANISATION_SERVICES = ["equipment", "projects"] as const;
export type OrganisationService = (typeof ORGANISATION_SERVICES)[number];

export const TEAM_SIZES = ["1-10", "11-50", "51-200", "200+"] as const;
export type TeamSize = (typeof TEAM_SIZES)[number];

export const isOrganisationService = (
  value: unknown,
): value is OrganisationService =>
  typeof value === "string" &&
  (ORGANISATION_SERVICES as readonly string[]).includes(value);

export interface OrganisationLogo {
  url: string;
  fileUrl: string;
  publicId: string;
  resourceType: "image" | "raw";
}

export interface OrganisationPortfolioItem {
  _id: Types.ObjectId;
  title: string;
  description: string;
  imageUrl: string;
  fileUrl: string;
  publicId: string;
  resourceType: "image" | "raw";
  uploadedAt: Date;
}

/** A company account's profile. The company name is the account's `User.name`. */
export interface IOrganisation extends Document {
  user: Types.ObjectId;
  services: OrganisationService[];
  logo?: OrganisationLogo;
  about?: string;
  location?: string;
  serviceAreas: string[];
  specialties: string[];
  tradeLicenceNo?: string;
  yearFounded?: number;
  teamSize?: TeamSize;
  website?: string;
  phone?: string;
  portfolio: Types.DocumentArray<OrganisationPortfolioItem>;
  createdAt: Date;
  updatedAt: Date;
}

const logoSchema = new Schema<OrganisationLogo>(
  {
    url: { type: String, required: true },
    fileUrl: { type: String, required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ["image", "raw"], required: true },
  },
  { _id: false },
);

const organisationSchema = new Schema<IOrganisation>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    services: {
      type: [{ type: String, enum: ORGANISATION_SERVICES }],
      validate: {
        validator: (value: string[]) => value.length > 0,
        message: "Choose at least one service",
      },
      required: true,
    },
    logo: { type: logoSchema, default: undefined },
    about: { type: String, trim: true, maxlength: 1000 },
    location: { type: String, trim: true, maxlength: 160 },
    serviceAreas: { type: [{ type: String, trim: true, maxlength: 60 }], default: [] },
    specialties: { type: [{ type: String, trim: true, maxlength: 60 }], default: [] },
    tradeLicenceNo: { type: String, trim: true, maxlength: 60 },
    yearFounded: { type: Number, min: 1900, max: 2100 },
    teamSize: { type: String, enum: TEAM_SIZES },
    website: { type: String, trim: true, maxlength: 200 },
    phone: { type: String, trim: true, maxlength: 30 },
    portfolio: [
      {
        title: { type: String, required: true, trim: true },
        description: { type: String, required: true, trim: true },
        imageUrl: { type: String, required: true },
        fileUrl: { type: String, required: true },
        publicId: { type: String, required: true },
        resourceType: { type: String, enum: ["image", "raw"], required: true },
        uploadedAt: { type: Date, required: true, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

export const Organisation: Model<IOrganisation> = model<IOrganisation>(
  "Organisation",
  organisationSchema,
);
export default Organisation;
