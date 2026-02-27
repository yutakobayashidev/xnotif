import { join } from "path";
import type { TwitterNotification, NotificationHandler } from "./types";

export class ConsoleHandler implements NotificationHandler {
  handle(notification: TwitterNotification): void {
    const time = new Date().toISOString();
    const type = notification.data?.type || "unknown";
    const uri = notification.data?.uri || "";
    console.log(`[${time}] [${type}] ${notification.title}: ${notification.body}`);
    if (uri) console.log(`  -> https://x.com${uri}`);
  }
}

export class FileHandler implements NotificationHandler {
  private path: string;

  constructor(path?: string) {
    this.path = path || join(process.cwd(), "tweets.json");
  }

  async handle(notification: TwitterNotification): Promise<void> {
    const file = Bun.file(this.path);
    let data: unknown[] = [];
    if (await file.exists()) {
      data = await file.json();
    }
    data.push({
      ...notification,
      _receivedAt: new Date().toISOString(),
    });
    await Bun.write(this.path, JSON.stringify(data, null, 2));
  }
}

export class CallbackHandler implements NotificationHandler {
  constructor(
    private callback: (
      notification: TwitterNotification,
    ) => void | Promise<void>,
  ) {}

  handle(notification: TwitterNotification): void | Promise<void> {
    return this.callback(notification);
  }
}
