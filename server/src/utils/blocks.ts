import { Block } from "../models/Block.model";

/**
 * Blocks work both ways: if either person blocked the other, they can't
 * connect, message, comment on each other's posts or see each other in
 * suggestions.
 */

export const isBlockedEitherWay = async (a: string, b: string): Promise<boolean> =>
  Boolean(
    await Block.exists({
      $or: [
        { blocker: a, blocked: b },
        { blocker: b, blocked: a },
      ],
    }),
  );

/** Everyone the user blocked or was blocked by. */
export const blockedUserIds = async (userId: string): Promise<Set<string>> => {
  const rows = await Block.find({ $or: [{ blocker: userId }, { blocked: userId }] })
    .select("blocker blocked")
    .exec();
  return new Set(
    rows.map((row) =>
      row.blocker.toString() === userId ? row.blocked.toString() : row.blocker.toString(),
    ),
  );
};

export const isBlockedByMe = async (me: string, other: string): Promise<boolean> =>
  Boolean(await Block.exists({ blocker: me, blocked: other }));
