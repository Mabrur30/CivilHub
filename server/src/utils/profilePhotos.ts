import { Types } from "mongoose";
import { Client } from "../models/Client.model";
import { Engineer } from "../models/Engineer.model";

// Both engineers and clients can upload a profile photo, and each role keeps it
// on its own profile document. Every lookup goes through here so a photo shows
// up wherever a person's avatar does, whichever role they have.
export const getProfilePhotoMap = async (
  userIds: Array<string | Types.ObjectId>,
): Promise<Map<string, string>> => {
  const objectIds = [...new Set(userIds.map((id) => id.toString()))]
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  if (objectIds.length === 0) {
    return new Map<string, string>();
  }

  const [engineers, clients] = await Promise.all([
    Engineer.find({ user: { $in: objectIds } })
      .select("user profilePhoto")
      .exec(),
    Client.find({ user: { $in: objectIds } })
      .select("user profilePhoto")
      .exec(),
  ]);

  const photos = new Map<string, string>();
  for (const profile of [...engineers, ...clients]) {
    const url = profile.profilePhoto?.url;
    if (url) photos.set(profile.user.toString(), url);
  }
  return photos;
};

export const getProfilePhotoUrl = async (
  userId: string | Types.ObjectId,
): Promise<string | null> =>
  (await getProfilePhotoMap([userId])).get(userId.toString()) ?? null;
