import { type Response } from "express";
import { RealtimeHub } from "../realtime/realtime.hub";

interface ResponseDouble {
  write: jest.Mock<boolean, [string]>;
  end: jest.Mock<void, []>;
}

const responseDouble = (): ResponseDouble => ({
  write: jest.fn((_frame: string) => true),
  end: jest.fn(() => undefined),
});

const asResponse = (response: ResponseDouble): Response =>
  response as unknown as Response;

describe("RealtimeHub", () => {
  test("emits one event to deduplicated users with a default scope", () => {
    const hub = new RealtimeHub();
    const response = responseDouble();
    hub.subscribe("user-1", "client", asResponse(response));

    hub.emitToUsers(["user-1", "user-1"], ["dashboard"]);

    expect(response.write).toHaveBeenCalledTimes(1);
    const frame = response.write.mock.calls[0][0];
    expect(frame).toMatch(/^event: invalidate\nid: [\w-]+\ndata: /);
    expect(frame).toContain('"topics":["dashboard"]');
    expect(frame).toContain('"scope":{}');
  });

  test("filters role emissions and caps connections by closing the oldest", () => {
    const hub = new RealtimeHub();
    const responses = Array.from({ length: 6 }, responseDouble);
    responses.forEach((response, index) => {
      hub.subscribe("user-1", index === 5 ? "engineer" : "client", asResponse(response));
    });

    expect(responses[0].end).toHaveBeenCalledTimes(1);
    hub.emitToRole(["engineer"], ["messages"]);
    expect(responses[5].write).toHaveBeenCalledTimes(1);
    expect(responses[1].write).not.toHaveBeenCalled();
  });

  test("removes unsubscribed and throwing connections without throwing", () => {
    const hub = new RealtimeHub();
    const response = responseDouble();
    response.write.mockImplementation(() => {
      throw new Error("closed");
    });
    hub.subscribe("user-1", "client", asResponse(response));

    expect(() => hub.emitToUser("user-1", ["notifications"])).not.toThrow();
    hub.unsubscribe("user-1", asResponse(response));
    hub.closeAll();
    expect(response.end).not.toHaveBeenCalled();
  });

  test("closes every active connection", () => {
    const hub = new RealtimeHub();
    const first = responseDouble();
    const second = responseDouble();
    hub.subscribe("user-1", "client", asResponse(first));
    hub.subscribe("user-2", "engineer", asResponse(second));

    hub.closeAll();

    expect(first.end).toHaveBeenCalledTimes(1);
    expect(second.end).toHaveBeenCalledTimes(1);
  });
});
