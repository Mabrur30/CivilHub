import { NOTIFICATION_TYPES } from "../models/Notification.model";
import { NOTIFICATION_TOPICS } from "../realtime/notificationTopics";

test("notification topic mapping is exhaustive", () => {
  expect(Object.keys(NOTIFICATION_TOPICS).sort()).toEqual([...NOTIFICATION_TYPES].sort());
  for (const type of NOTIFICATION_TYPES) {
    expect(NOTIFICATION_TOPICS[type]).toContain("notifications");
  }
});
