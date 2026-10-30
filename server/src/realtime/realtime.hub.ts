import { type Response } from "express";
import { randomUUID } from "crypto";
import {
  type RealtimeEvent,
  type RealtimeScope,
  type RealtimeTopic,
} from "./realtime.types";

interface Connection {
  role: string;
  res: Response;
}

const MAX_CONNECTIONS_PER_USER = 5;

class RealtimeHub {
  private readonly connections = new Map<string, Set<Connection>>();

  public subscribe(userId: string, role: string, res: Response): void {
    try {
      let userConnections = this.connections.get(userId);
      if (!userConnections) {
        userConnections = new Set<Connection>();
        this.connections.set(userId, userConnections);
      }
      while (userConnections.size >= MAX_CONNECTIONS_PER_USER) {
        const oldest = userConnections.values().next().value as Connection | undefined;
        if (!oldest) break;
        userConnections.delete(oldest);
        try {
          oldest.res.end();
        } catch (error: unknown) {
          console.error("Failed to close oldest realtime connection", error);
        }
      }
      userConnections.add({ role, res });
    } catch (error: unknown) {
      console.error("Failed to subscribe realtime connection", error);
    }
  }

  public unsubscribe(userId: string, res: Response): void {
    try {
      const userConnections = this.connections.get(userId);
      if (!userConnections) return;
      for (const connection of userConnections) {
        if (connection.res === res) userConnections.delete(connection);
      }
      if (userConnections.size === 0) this.connections.delete(userId);
    } catch (error: unknown) {
      console.error("Failed to unsubscribe realtime connection", error);
    }
  }

  public emitToUser(
    userId: string,
    topics: RealtimeTopic[],
    scope: RealtimeScope = {},
  ): void {
    try {
      this.emitToConnections([userId], undefined, topics, scope);
    } catch (error: unknown) {
      console.error("Failed to emit realtime event to user", error);
    }
  }

  public emitToUsers(
    userIds: string[],
    topics: RealtimeTopic[],
    scope: RealtimeScope = {},
  ): void {
    try {
      this.emitToConnections([...new Set(userIds)], undefined, topics, scope);
    } catch (error: unknown) {
      console.error("Failed to emit realtime event to users", error);
    }
  }

  public emitToRole(
    roles: string[],
    topics: RealtimeTopic[],
    scope: RealtimeScope = {},
  ): void {
    try {
      this.emitToConnections(
        [...this.connections.keys()],
        new Set(roles),
        topics,
        scope,
      );
    } catch (error: unknown) {
      console.error("Failed to emit realtime event to roles", error);
    }
  }

  public closeAll(): void {
    try {
      for (const userConnections of this.connections.values()) {
        for (const connection of userConnections) {
          try {
            connection.res.end();
          } catch (error: unknown) {
            console.error("Failed to close realtime connection", error);
          }
        }
      }
      this.connections.clear();
    } catch (error: unknown) {
      console.error("Failed to close realtime connections", error);
    }
  }

  private emitToConnections(
    userIds: string[],
    roles: Set<string> | undefined,
    topics: RealtimeTopic[],
    scope: RealtimeScope,
  ): void {
    const event: RealtimeEvent = {
      id: randomUUID(),
      topics,
      scope,
      createdAt: new Date().toISOString(),
    };
    const frame =
      `event: invalidate\nid: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const userId of userIds) {
      const userConnections = this.connections.get(userId);
      if (!userConnections) continue;
      for (const connection of userConnections) {
        if (roles && !roles.has(connection.role)) continue;
        try {
          connection.res.write(frame);
        } catch (error: unknown) {
          console.error("Failed to write realtime event", error);
          this.unsubscribe(userId, connection.res);
        }
      }
    }
  }
}

export const realtimeHub = new RealtimeHub();
export { RealtimeHub };
