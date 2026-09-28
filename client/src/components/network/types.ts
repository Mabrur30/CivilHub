/** A pending request, sent or received. */
export interface NetworkUser {
  id: string;
  userId: string;
  name: string;
  role: "client" | "engineer" | "organisation";
  status: "pending";
  profilePhotoUrl: string | null;
}

/** Someone you're connected to. */
export interface ConnectionUser {
  /** The connection record, used to remove it. */
  connectionId?: string;
  userId: string;
  name: string;
  role: "client" | "engineer" | "organisation";
  profilePhotoUrl: string | null;
  rating: number | null;
  reviewCount: number;
}

/** A person in suggestions or search results. */
export interface PersonResult {
  id: string;
  name: string;
  role?: "engineer" | "organisation";
  profilePhotoUrl: string | null;
  /** The line under the name: a bio, or why they're suggested. */
  bio: string;
  location: string | null;
}
