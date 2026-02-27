import type { AutopushNotification } from "./types";

const AUTOPUSH_URL = "wss://push.services.mozilla.com/";

interface AutopushOptions {
  uaid?: string;
  channelId: string;
  vapidKey: string;
  remoteBroadcasts?: Record<string, string>;
  onNotification: (notification: AutopushNotification) => void;
  onEndpointChanged: (endpoint: string) => void;
}

export class AutopushClient {
  private ws: WebSocket | null = null;
  private uaid = "";
  private endpoint = "";
  private reconnectDelay = 1000;
  private lastMessage = Date.now();
  private heartbeatTimer: Timer | null = null;
  private closed = false;
  private remoteBroadcasts: Record<string, string>;

  constructor(private options: AutopushOptions) {
    if (options.uaid) this.uaid = options.uaid;
    this.remoteBroadcasts = options.remoteBroadcasts || {};
  }

  getUaid(): string {
    return this.uaid;
  }

  getEndpoint(): string {
    return this.endpoint;
  }

  getRemoteBroadcasts(): Record<string, string> {
    return this.remoteBroadcasts;
  }

  connect(): Promise<string> {
    return new Promise((resolve, reject) => {
      let resolved = false;
      this.ws = new WebSocket(AUTOPUSH_URL, ["push-notification"]);

      this.ws.onopen = () => {
        this.reconnectDelay = 1000;
        this.send({
          messageType: "hello",
          use_webpush: true,
          uaid: this.uaid || "",
          broadcasts: this.remoteBroadcasts,
        });
      };

      this.ws.onmessage = (event) => {
        this.lastMessage = Date.now();
        const msg = JSON.parse(String(event.data));

        switch (msg.messageType) {
          case "hello":
            this.uaid = msg.uaid;
            if (msg.broadcasts) {
              this.remoteBroadcasts = msg.broadcasts;
            }
            // Register channel after hello
            this.send({
              channelID: this.options.channelId,
              messageType: "register",
              key: this.options.vapidKey,
            });
            break;

          case "register":
            if (msg.status === 200) {
              const newEndpoint = msg.pushEndpoint as string;
              if (this.endpoint && this.endpoint !== newEndpoint) {
                this.options.onEndpointChanged(newEndpoint);
              }
              this.endpoint = newEndpoint;
              if (!resolved) {
                resolved = true;
                resolve(newEndpoint);
              }
            } else {
              const err = new Error(`Register failed: status ${msg.status}`);
              if (!resolved) {
                resolved = true;
                reject(err);
              }
            }
            break;

          case "notification": {
            const notification = msg as AutopushNotification;
            // Acknowledge immediately
            this.send({
              messageType: "ack",
              updates: [
                {
                  channelID: notification.channelID,
                  version: notification.version,
                  code: 100,
                },
              ],
            });
            this.options.onNotification(notification);
            break;
          }
        }
      };

      this.ws.onclose = () => {
        if (!this.closed) this.reconnect();
      };

      this.ws.onerror = (err) => {
        console.error("[autopush] WebSocket error:", err);
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      };

      this.startHeartbeat();
    });
  }

  close(): void {
    this.closed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.ws?.close();
  }

  private send(msg: Record<string, unknown>): void {
    this.ws?.send(JSON.stringify(msg));
  }

  private reconnect(): void {
    console.log(
      `[autopush] Reconnecting in ${this.reconnectDelay / 1000}s...`,
    );
    setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60_000);
      this.connect().catch((err) => {
        console.error("[autopush] Reconnect failed:", err);
      });
    }, this.reconnectDelay);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      // Force reconnect if no messages for 5.5 minutes
      if (Date.now() - this.lastMessage > 5.5 * 60 * 1000) {
        console.log("[autopush] No message for 5.5 min, forcing reconnect");
        this.ws?.close();
      }
    }, 60_000);
  }
}
