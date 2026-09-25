import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import cloudinary, { uploadBuffer } from "../config/cloudinary";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Connection } from "../models/Connection.model";
import { Conversation } from "../models/Conversation.model";
import {
  MESSAGE_AUDIO_MAX_SECONDS,
  messageAttachmentTypes,
  messageAudioTypes,
} from "../middleware/upload.middleware";
import { type IMessage, Message } from "../models/Message.model";
import { Notification } from "../models/Notification.model";
import { User, type UserRole } from "../models/User.model";
import { getProfilePhotoMap } from "../utils/profilePhotos";

interface MessageError extends Error {
  statusCode: number;
}

interface ConversationParams {
  conversationId?: string;
  otherUserId?: string;
}

export interface SendMessageBody {
  content?: string;
  messageType?: string;
  durationSeconds?: string;
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

const getPhotoMap = (users: PopulatedUser[]): Promise<Map<string, string>> =>
  getProfilePhotoMap(users.map((user) => user._id));

const ensureAcceptedConnection = async (
  userId: string,
  otherUserId: string,
  requesterRole: UserRole,
  otherUserRole: UserRole,
): Promise<void> => {
  if (requesterRole === "client" && otherUserRole === "engineer") {
    return;
  }

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

const getBaseMimeType = (mimeType: string): string =>
  mimeType.split(";")[0].trim().toLowerCase();

// Recorded audio can run slightly past the client-side cap before the recorder stops.
const AUDIO_DURATION_TOLERANCE_SECONDS = 2;

const toAttachmentView = (message: IMessage) =>
  message.messageType === "text" || !message.attachmentUrl
    ? null
    : {
        url: message.attachmentUrl,
        name: message.attachmentName ?? "Attachment",
        mimeType: message.attachmentMimeType ?? "application/octet-stream",
        size: message.attachmentSize ?? null,
        durationSeconds: message.durationSeconds ?? null,
      };

interface UploadedAttachment {
  messageType: "file" | "audio";
  url: string;
  publicId: string;
  resourceType: "image" | "video" | "raw";
  name: string;
  mimeType: string;
  size: number;
  durationSeconds?: number;
}

const uploadMessageAttachment = async (
  file: Express.Multer.File,
  requestedType: string | undefined,
  clientDuration: string | undefined,
): Promise<UploadedAttachment> => {
  const mimeType = getBaseMimeType(file.mimetype);
  const name = file.originalname.trim() || "Attachment";

  if (requestedType === "audio") {
    if (!messageAudioTypes.includes(mimeType)) {
      throw createMessageError("Unsupported audio format.", 400);
    }

    const result = await uploadBuffer(file.buffer, {
      folder: "civilhub/messages/audio",
      resource_type: "video",
    });

    const reportedDuration = Number(clientDuration);
    const durationSeconds =
      typeof result.duration === "number" && Number.isFinite(result.duration)
        ? result.duration
        : Number.isFinite(reportedDuration) && reportedDuration > 0
          ? reportedDuration
          : 0;

    if (
      durationSeconds >
      MESSAGE_AUDIO_MAX_SECONDS + AUDIO_DURATION_TOLERANCE_SECONDS
    ) {
      await cloudinary.uploader.destroy(result.public_id, {
        resource_type: "video",
      });
      throw createMessageError(
        "Voice messages must be 5 minutes or shorter.",
        400,
      );
    }

    return {
      messageType: "audio",
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: "video",
      name,
      mimeType,
      size: file.size,
      durationSeconds: Math.round(durationSeconds),
    };
  }

  if (!messageAttachmentTypes.includes(mimeType)) {
    throw createMessageError("Unsupported file type.", 400);
  }

  // Images stay as images so they can be previewed; everything else is stored
  // as a raw file so it downloads unchanged with its original extension.
  const resourceType = mimeType.startsWith("image/") ? "image" : "raw";
  const result = await uploadBuffer(file.buffer, {
    folder: "civilhub/messages/files",
    resource_type: resourceType,
    ...(resourceType === "raw"
      ? { use_filename: true, unique_filename: true, filename_override: name }
      : {}),
  });

  return {
    messageType: "file",
    url: result.secure_url,
    publicId: result.public_id,
    resourceType,
    name,
    mimeType,
    size: file.size,
  };
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

    const otherUser = await User.findById(otherUserId)
      .select("_id role")
      .exec();
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

    await ensureAcceptedConnection(
      userId,
      otherUserId,
      req.user.role,
      otherUser.role,
    );

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

export const getUnreadMessageCountsByConversation = async (
  userId: string,
  conversationIds: Types.ObjectId[],
): Promise<Map<string, number>> => {
  if (conversationIds.length === 0) {
    return new Map();
  }

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

  return new Map(
    unreadRows.map((row) => [row._id.toString(), row.unreadCount]),
  );
};

export const getTotalUnreadMessageCount = async (
  userId: string,
): Promise<number> => {
  const conversations = await Conversation.find({ participants: userId })
    .select("_id")
    .exec();
  const conversationIds = conversations.map((conversation) => conversation._id);

  const unreadByConversation = await getUnreadMessageCountsByConversation(
    userId,
    conversationIds,
  );

  let total = 0;
  for (const count of unreadByConversation.values()) {
    total += count;
  }
  return total;
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
      .populate({
        path: "lastMessage",
        select:
          "content createdAt sender messageType attachmentName durationSeconds",
      })
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

    const photoByUser = await getPhotoMap(otherUsers);

    const conversationIds = conversations.map(
      (conversation) => conversation._id,
    );

    const unreadByConversation = await getUnreadMessageCountsByConversation(
      userId,
      conversationIds,
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
                content?: string;
                createdAt: Date;
                sender: Types.ObjectId;
                messageType?: IMessage["messageType"];
                attachmentName?: string;
                durationSeconds?: number;
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
                content: lastMessage.content ?? "",
                messageType: lastMessage.messageType ?? "text",
                attachmentName: lastMessage.attachmentName ?? null,
                durationSeconds: lastMessage.durationSeconds ?? null,
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

    const photoByUser = await getPhotoMap(senders);

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
    const participantPhotoMap = await getPhotoMap(typedParticipants);

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
          messageType: message.messageType ?? "text",
          content: message.content ?? "",
          attachment: toAttachmentView(message),
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
    if (!content && !req.file) {
      throw createMessageError("Message content is required", 400);
    }

    const conversation = await getConversationIfParticipant(
      conversationId,
      userId,
    );

    const senderObjectId = new Types.ObjectId(userId);

    const attachment = req.file
      ? await uploadMessageAttachment(
          req.file,
          req.body.messageType,
          req.body.durationSeconds,
        )
      : null;

    let message: IMessage;
    try {
      message = await Message.create({
        conversation: conversation._id,
        sender: senderObjectId,
        messageType: attachment?.messageType ?? "text",
        content: content || undefined,
        ...(attachment
          ? {
              attachmentUrl: attachment.url,
              attachmentPublicId: attachment.publicId,
              attachmentName: attachment.name,
              attachmentMimeType: attachment.mimeType,
              attachmentSize: attachment.size,
              durationSeconds: attachment.durationSeconds,
            }
          : {}),
        readBy: [senderObjectId],
      });
    } catch (error: unknown) {
      if (attachment) {
        await cloudinary.uploader
          .destroy(attachment.publicId, {
            resource_type: attachment.resourceType,
          })
          .catch(() => undefined);
      }
      throw error;
    }

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
    const senderPhotoMap = await getPhotoMap(
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
      messageType: message.messageType,
      content: message.content ?? "",
      attachment: toAttachmentView(message),
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
