import { EventEmitter } from "events";
import { Decryptor } from "./decrypt";
import { AutopushClient } from "./autopush";
import {
  createClient as createTwitterClient,
  registerPush,
} from "./twitter";
import { base64urlToBuffer } from "./utils";
import type {
  AutopushNotification,
  ClientState,
  NotificationClientOptions,
  TwitterNotification,
} from "./types";

const VAPID_KEY =
  "BF5oEo0xDUpgylKDTlsd8pZmxQA1leYINiY-rSscWYK_3tWAkz4VMbtf1MLE_Yyd6iII6o-e3Q9TCN5vZMzVMEs";

interface NotificationClientEvents {
  notification: [notification: TwitterNotification];
  connected: [state: ClientState];
  error: [error: Error];
  disconnected: [];
  reconnecting: [delay: number];
}

export class NotificationClient extends EventEmitter<NotificationClientEvents> {
  private autopush: AutopushClient | null = null;
  private running = false;
  private options: NotificationClientOptions;

  constructor(options: NotificationClientOptions) {
    super();
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      let decryptor: Decryptor;
      let channelId: string;
      let uaid: string | undefined;
      let savedEndpoint: string | undefined;
      let remoteBroadcasts: Record<string, string> | undefined;

      if (this.options.state) {
        const s = this.options.state;
        decryptor = await Decryptor.create(s.decryptor.jwk, s.decryptor.auth);
        channelId = s.channelId;
        uaid = s.uaid;
        savedEndpoint = s.endpoint;
        remoteBroadcasts = s.remoteBroadcasts;
      } else {
        decryptor = await Decryptor.create();
        channelId = crypto.randomUUID();
      }

      this.autopush = new AutopushClient({
        uaid,
        channelId,
        vapidKey: VAPID_KEY,
        remoteBroadcasts,
        onNotification: async (msg: AutopushNotification) => {
          try {
            const payload = base64urlToBuffer(msg.data);
            const json = await decryptor.decrypt(
              msg.headers.crypto_key,
              msg.headers.encryption,
              payload,
            );
            const notification: TwitterNotification = JSON.parse(json);
            this.emit("notification", notification);
          } catch (err) {
            this.emit("error", err instanceof Error ? err : new Error(String(err)));
          }
        },
        onError: (err) => {
          this.emit("error", err instanceof Error ? err : new Error(String(err)));
        },
        onDisconnected: () => {
          this.emit("disconnected");
        },
        onReconnecting: (delay) => {
          this.emit("reconnecting", delay);
        },
      });

      const endpoint = await this.autopush.connect();
      const needsRegistration = endpoint !== savedEndpoint;

      const state: ClientState = {
        uaid: this.autopush.getUaid(),
        channelId,
        endpoint,
        remoteBroadcasts: this.autopush.getRemoteBroadcasts(),
        decryptor: {
          jwk: decryptor.getJwk(),
          auth: decryptor.getAuthBase64url(),
        },
      };

      this.emit("connected", state);

      if (needsRegistration) {
        const twitterClient = await createTwitterClient(this.options.cookies);
        await registerPush(twitterClient, {
          endpoint,
          p256dh: decryptor.getPublicKeyBase64url(),
          auth: decryptor.getAuthBase64url(),
        });
      }
    } catch (err) {
      this.running = false;
      this.autopush = null;
      throw err;
    }
  }

  stop(): void {
    this.running = false;
    this.autopush?.close();
    this.autopush = null;
  }
}

export function createClient(
  options: NotificationClientOptions,
): NotificationClient {
  return new NotificationClient(options);
}
