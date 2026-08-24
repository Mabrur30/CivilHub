import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Connection } from "../models/Connection.model";
import { Conversation } from "../models/Conversation.model";
import { Engineer } from "../models/Engineer.model";
import { Message } from "../models/Message.model";
import { Notification } from "../models/Notification.model";
import { User, type UserRole } from "../models/User.model";

interface MessageError extends Error {
  statusCode: number;
}

interface ConversationParams {
  conversationId?: string;
  otherUserId?: string;
}

export interface SendMessageBody {
  content: string;
}

interface PopulatedUser {
  _id: Types.ObjectId;
  name: string;
  role: UserRole;
}

const createMessageError = (
  message: string,
  statusCode: number,
): MessageError => {
  const error = new Error(message) as MessageError;
  error.statusCode = statusCode;
  return error;
};

const requireUser = (req: AuthenticatedRequest): string => {
  if (!req.user?.userId) {
    throw createMessageError("Authentication required", 401);
  }
  return req.user.userId;
};

const getParams = (req: AuthenticatedRequest): ConversationParams =>
  req.params as unknown as ConversationParams;

const createPairKey = (firstUserId: string, secondUserId: string): string =>
  [firstUserId, secondUserId].sort().join(":");

const getEngineerPhotoMap = async (
  users: PopulatedUser[],
): Promise<Map<string, string>> => {
  const engineerUserIds = users
    .filter((user) => user.role === "engineer")
    .map((user) => user._id);

  if (engineerUserIds.length === 0) {
    return new Map<string, string>();
  }

  const engineers = await Engineer.find({ user: { $in: engineerUserIds } })
    .select("user profilePhoto")
    .exec();

  return new Map(
    engineers.map((engineer) => [
      engineer.user.toString(),
      engineer.profilePhoto?.url ?? "",
    ]),
  );
};

const ensureAcceptedConnection = async (
  userId: string,
  otherUserId: string,
): Promise<void> => {
  const connection = await Connection.findOne({
    $or: [
      { requester: userId, recipient: otherUserId },
      { requester: otherUserId, recipient: userId },
    ],
    status: "accepted",
  }).exec();

  if (!connection) {
    throw createMessageError(
      "You can only start conversations with accepted connections",
      403,
    );
  }
};

const getConversationIfParticipant = async (
  conversationId: string,
  userId: string,
) => {
  if (!Types.ObjectId.isValid(conversationId)) {
    throw createMessageError("Conversation not found", 404);
  }

  const conversation = await Conversation.findById(conversationId).exec();
  if (!conversation) {
    throw createMessageError("Conversation not found", 404);
  }

  const isParticipant = conversation.participants.some(
    (participant) => participant.toString() === userId,
  );

  if (!isParticipant) {
    throw createMessageError(
      "You are not a participant in this conversation",
      403,
    );
  }

  return conversation;
};

const toUserView = (
  user: PopulatedUser,
  photoByUser: Map<string, string>,
): {
  userId: string;
  name: string;
  role: UserRole;
  profilePhotoUrl: string | null;
} => ({
  userId: user._id.toString(),
  name: user.name,
  role: user.role,
  profilePhotoUrl: photoByUser.get(user._id.toString()) ?? null,
});

export const getOrCreateConversation = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);
    const { otherUserId } = getParams(req);

    if (!otherUserId) {
      throw createMessageError("Other user ID is required", 400);
    }

    if (!Types.ObjectId.isValid(otherUserId)) {
      throw createMessageError("User not found", 404);
    }

    if (otherUserId === userId) {
      throw createMessageError(
        "You cannot start a conversation with yourself",
        400,
      );
    }

    const otherUser = await User.findById(otherUserId).select("_id").exec();
    if (!otherUser) {
      throw createMessageError("User not found", 404);
    }

    const pairKey = createPairKey(userId, otherUserId);
    const existing = await Conversation.findOne({ pairKey }).exec();

    if (existing) {
      res.status(200).json({
        id: existing._id.toString(),
        participants: existing.participants.map((participant) =>
          participant.toString(),
        ),
        lastMessageAt: existing.lastMessageAt?.toISOString() ?? null,
      });
      return;
    }

    await ensureAcceptedConnection(userId, otherUserId);

    const conversation = await Conversation.create({
      participants: [
        new Types.ObjectId(userId),
        new Types.ObjectId(otherUserId),
      ],
      pairKey,
    });

    res.status(201).json({
      id: conversation._id.toString(),
      participants: conversation.participants.map((participant) =>
        participant.toString(),
      ),
      lastMessageAt: null,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const getMyConversations = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);

    const conversations = await Conversation.find({ participants: userId })
      .populate("participants", "name role")
      .populate({ path: "lastMessage", select: "content createdAt sender" })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .exec();

    const otherUsers = conversations
      .map((conversation) =>
        (conversation.participants as unknown as PopulatedUser[]).find(
          (participant) => participant._id.toString() !== userId,
        ),
      )
      .filter((participant): participant is PopulatedUser =>
        Boolean(participant),
      );

    const photoByUser = await getEngineerPhotoMap(otherUsers);

    const conversationIds = conversations.map(
      (conversation) => conversation._id,
    );

    const unreadRows = await Message.aggregate<{
      _id: Types.ObjectId;
      unreadCount: number;
    }>([
      {
        $match: {
          conversation: { $in: conversationIds },
          sender: { $ne: new Types.ObjectId(userId) },
          readBy: { $ne: new Types.ObjectId(userId) },
        },
      },
      {
        $group: {
          _id: "$conversation",
          unreadCount: { $sum: 1 },
        },
      },
    ]);

    const unreadByConversation = new Map(
      unreadRows.map((row) => [row._id.toString(), row.unreadCount]),
    );

    res.status(200).json(
      conversations.map((conversation) => {
        const participants =
          conversation.participants as unknown as PopulatedUser[];
        const otherParticipant = participants.find(
          (participant) => participant._id.toString() !== userId,
        );

        const lastMessageValue = conversation.lastMessage as unknown;
        const lastMessage =
          typeof lastMessageValue === "object" &&
          lastMessageValue !== null &&
          "content" in lastMessageValue &&
          "createdAt" in lastMessageValue &&
          "sender" in lastMessageValue
            ? (lastMessageValue as {
                _id: Types.ObjectId;
                content: string;
                createdAt: Date;
                sender: Types.ObjectId;
              })
            : null;

        if (!otherParticipant) {
          return {
            id: conversation._id.toString(),
            otherParticipant: {
              userId,
              name: "Unknown user",
              role: "client" as UserRole,
              profilePhotoUrl: null,
            },
            lastMessage: null,
            unreadCount: 0,
            updatedAt: conversation.updatedAt.toISOString(),
          };
        }

        return {
          id: conversation._id.toString(),
          otherParticipant: toUserView(otherParticipant, photoByUser),
          lastMessage: lastMessage
            ? {
                id: lastMessage._id.toString(),
                content: lastMessage.content,
                createdAt: lastMessage.createdAt.toISOString(),
                senderId: lastMessage.sender.toString(),
              }
            : null,
          unreadCount:
            unreadByConversation.get(conversation._id.toString()) ?? 0,
          updatedAt: conversation.updatedAt.toISOString(),
        };
      }),
    );
  } catch (error: unknown) {
    next(error);
  }
};

export const getMessages = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);
    const { conversationId } = getParams(req);

    if (!conversationId) {
      throw createMessageError("Conversation ID is required", 400);
    }

    const conversation = await getConversationIfParticipant(
      conversationId,
      userId,
    );

    const messages = await Message.find({ conversation: conversation._id })
      .populate("sender", "name role")
      .sort({ createdAt: 1 })
      .exec();

    const senders = messages
      .map((message) => message.sender as unknown as PopulatedUser)
      .filter(
        (sender, index, array) =>
          array.findIndex((candidate) => candidate._id.equals(sender._id)) ===
          index,
      );

    const photoByUser = await getEngineerPhotoMap(senders);

    await Message.updateMany(
      {
        conversation: conversation._id,
        sender: { $ne: new Types.ObjectId(userId) },
        readBy: { $ne: new Types.ObjectId(userId) },
      },
      {
        $addToSet: {
          readBy: new Types.ObjectId(userId),
        },
      },
    ).exec();

    const participants = await User.find({
      _id: { $in: conversation.participants },
    })
      .select("name role")
      .exec();
    const typedParticipants = participants as unknown as PopulatedUser[];
    const otherParticipant = typedParticipants.find(
      (participant) => participant._id.toString() !== userId,
    );
    const participantPhotoMap = await getEngineerPhotoMap(typedParticipants);

    res.status(200).json({
      conversationId: conversation._id.toString(),
      otherParticipant: otherParticipant
        ? toUserView(otherParticipant, participantPhotoMap)
        : null,
      messages: messages.map((message) => {
        const sender = message.sender as unknown as PopulatedUser;
        return {
          id: message._id.toString(),
          conversationId: conversation._id.toString(),
          content: message.content,
          createdAt: message.createdAt.toISOString(),
          sender: {
            userId: sender._id.toString(),
            name: sender.name,
            role: sender.role,
            profilePhotoUrl: photoByUser.get(sender._id.toString()) ?? null,
          },
          isReadByRequester: message.readBy.some(
            (reader) => reader.toString() === userId,
          ),
        };
      }),
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const sendMessage = async (
  req: AuthenticatedRequest<SendMessageBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);
    const { conversationId } = getParams(req);

    if (!conversationId) {
      throw createMessageError("Conversation ID is required", 400);
    }

    const content = req.body.content?.trim();
    if (!content) {
      throw createMessageError("Message content is required", 400);
    }

    const conversation = await getConversationIfParticipant(
      conversationId,
      userId,
    );

    const senderObjectId = new Types.ObjectId(userId);

    const message = await Message.create({
      conversation: conversation._id,
      sender: senderObjectId,
      content,
      readBy: [senderObjectId],
    });

    conversation.lastMessage = message._id;
    conversation.lastMessageAt = message.createdAt;
    await conversation.save();

    const recipient = conversation.participants.find(
      (participant) => participant.toString() !== userId,
    );

    if (recipient) {
      await Notification.create({
        recipient,
        type: "new_message",
        message: "You received a new message.",
        conversation: conversation._id,
        messageRef: message._id,
      });
    }

    const sender = await User.findById(userId).select("name role").exec();
    const senderPhotoMap = await getEngineerPhotoMap(
      sender
        ? [
            {
              _id: new Types.ObjectId(userId),
              name: sender.name,
              role: sender.role,
            },
          ]
        : [],
    );

    res.status(201).json({
      id: message._id.toString(),
      conversationId: conversation._id.toString(),
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      sender: {
        userId,
        name: sender?.name ?? "You",
        role: sender?.role ?? "client",
        profilePhotoUrl: senderPhotoMap.get(userId) ?? null,
      },
      isReadByRequester: true,
    });
  } catch (error: unknown) {
    next(error);
  }
};
