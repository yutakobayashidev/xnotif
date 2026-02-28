import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AutopushClient } from "./autopush";
import type { AutopushNotification } from "./types";

class MockWebSocket {
  static CONNECTING = 0 as const;
  static OPEN = 1 as const;
  static CLOSING = 2 as const;
  static CLOSED = 3 as const;

  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  sent: string[] = [];
  readyState: number = MockWebSocket.CONNECTING;

  constructor(
    public url: string,
    public protocols?: string | string[],
  ) {
    MockWebSocket.instances.push(this);
  }

  static instances: MockWebSocket[] = [];
  static reset() {
    MockWebSocket.instances = [];
  }

  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }
  simulateMessage(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
  }
  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new Event("close") as CloseEvent);
  }
  simulateError() {
    this.onerror?.(new Event("error"));
  }
}

function latestWs(): MockWebSocket {
  const ws = MockWebSocket.instances.at(-1);
  if (!ws) throw new Error("No MockWebSocket instance created");
  return ws;
}

function parseSent(ws: MockWebSocket): Record<string, unknown>[] {
  return ws.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
}

function driveHandshake(
  ws: MockWebSocket,
  uaid = "test-uaid",
  endpoint = "https://example.com/push/ep",
) {
  ws.simulateOpen();
  ws.simulateMessage({ messageType: "hello", uaid, broadcasts: {} });
  ws.simulateMessage({ messageType: "register", status: 200, pushEndpoint: endpoint });
}

describe("autopush", () => {
  describe("AutopushClient", () => {
    const defaultOpts = () => ({
      channelId: "chan-1",
      vapidKey: "vapid-key-123",
      onNotification: vi.fn(),
    });

    beforeEach(() => {
      MockWebSocket.reset();
      vi.stubGlobal("WebSocket", MockWebSocket);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it("sends hello message on WebSocket open", () => {
      const client = new AutopushClient(defaultOpts());
      void client.connect();

      const ws = latestWs();
      expect(ws.url).toBe("wss://push.services.mozilla.com/");
      expect(ws.protocols).toBeUndefined();

      ws.simulateOpen();
      expect(parseSent(ws)[0]).toEqual({
        messageType: "hello",
        use_webpush: true,
        uaid: "",
        broadcasts: {},
      });
    });

    it("sends hello with provided uaid and remoteBroadcasts", () => {
      const client = new AutopushClient({
        ...defaultOpts(),
        uaid: "existing-uaid",
        remoteBroadcasts: { "remote:key": "v1" },
      });
      void client.connect();

      const ws = latestWs();
      ws.simulateOpen();
      const hello = parseSent(ws)[0];
      expect(hello.uaid).toBe("existing-uaid");
      expect(hello.broadcasts).toEqual({ "remote:key": "v1" });
    });

    it("sends register after hello response", () => {
      const client = new AutopushClient(defaultOpts());
      void client.connect();

      const ws = latestWs();
      ws.simulateOpen();
      ws.simulateMessage({ messageType: "hello", uaid: "server-uaid" });

      expect(parseSent(ws)[1]).toEqual({
        messageType: "register",
        channelID: "chan-1",
        key: "vapid-key-123",
      });
    });

    it("resolves with endpoint on successful register", async () => {
      const client = new AutopushClient(defaultOpts());
      const promise = client.connect();
      driveHandshake(latestWs());
      await expect(promise).resolves.toBe("https://example.com/push/ep");
    });

    it("rejects on failed register", async () => {
      const client = new AutopushClient(defaultOpts());
      const promise = client.connect();

      const ws = latestWs();
      ws.simulateOpen();
      ws.simulateMessage({ messageType: "hello", uaid: "u" });
      ws.simulateMessage({ messageType: "register", status: 409 });

      await expect(promise).rejects.toThrow("Register failed: status 409");
    });

    it("sends ack and calls onNotification on notification", async () => {
      const onNotification = vi.fn();
      const client = new AutopushClient({ ...defaultOpts(), onNotification });
      const promise = client.connect();
      const ws = latestWs();
      driveHandshake(ws);
      await promise;

      const notification: AutopushNotification = {
        messageType: "notification",
        channelID: "chan-1",
        version: "v42",
        data: "encrypted-payload",
        headers: { crypto_key: "ck", encryption: "enc" },
      };
      ws.simulateMessage(notification);

      const messages = parseSent(ws);
      expect(messages[2]).toEqual({
        messageType: "ack",
        updates: [{ channelID: "chan-1", version: "v42", code: 100 }],
      });
      expect(onNotification).toHaveBeenCalledWith(notification);
    });

    it("updates state getters after handshake", async () => {
      const client = new AutopushClient(defaultOpts());
      const promise = client.connect();

      expect(client.getUaid()).toBe("");
      expect(client.getEndpoint()).toBe("");

      const ws = latestWs();
      ws.simulateOpen();
      ws.simulateMessage({ messageType: "hello", uaid: "new-uaid", broadcasts: { foo: "v2" } });
      expect(client.getUaid()).toBe("new-uaid");
      expect(client.getRemoteBroadcasts()).toEqual({ foo: "v2" });

      ws.simulateMessage({ messageType: "register", status: 200, pushEndpoint: "https://push/ep" });
      await promise;
      expect(client.getEndpoint()).toBe("https://push/ep");
    });

    it("close() prevents reconnection", async () => {
      vi.useFakeTimers();
      const onDisconnected = vi.fn();
      const client = new AutopushClient({ ...defaultOpts(), onDisconnected });
      const promise = client.connect();
      const ws = latestWs();
      driveHandshake(ws);
      await promise;

      client.close();
      ws.simulateClose();

      expect(onDisconnected).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it("calls onDisconnected and onReconnecting on unexpected close", async () => {
      vi.useFakeTimers();
      const onDisconnected = vi.fn();
      const onReconnecting = vi.fn();
      const client = new AutopushClient({ ...defaultOpts(), onDisconnected, onReconnecting });
      const promise = client.connect();
      const ws = latestWs();
      driveHandshake(ws);
      await promise;

      ws.simulateClose();
      expect(onDisconnected).toHaveBeenCalledOnce();
      expect(onReconnecting).toHaveBeenCalledWith(1000);

      await vi.advanceTimersByTimeAsync(1000);
      expect(MockWebSocket.instances).toHaveLength(2);
    });

    it("doubles reconnection delay and caps at 60000", async () => {
      vi.useFakeTimers();
      const onReconnecting = vi.fn();
      const onError = vi.fn();
      const client = new AutopushClient({ ...defaultOpts(), onReconnecting, onError });
      const promise = client.connect();
      let ws = latestWs();
      driveHandshake(ws);
      await promise;

      // First close triggers reconnect with delay=1000. Inside setTimeout, delay doubles.
      // Don't drive handshake on reconnect so onopen doesn't reset delay.
      // Instead, simulateClose on the new WS to trigger another reconnect.
      const expectedDelays = [1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000];
      for (const expectedDelay of expectedDelays) {
        ws.simulateClose();
        expect(onReconnecting).toHaveBeenLastCalledWith(expectedDelay);
        await vi.advanceTimersByTimeAsync(expectedDelay);
        ws = latestWs();
        // Don't call driveHandshake — keep delay escalating
      }
    });

    it("calls onError and rejects promise on WebSocket error", async () => {
      const onError = vi.fn();
      const client = new AutopushClient({ ...defaultOpts(), onError });
      const promise = client.connect();
      latestWs().simulateError();

      expect(onError).toHaveBeenCalledOnce();
      await expect(promise).rejects.toBeInstanceOf(Error);
      await expect(promise).rejects.toThrow("WebSocket connection failed");
    });

    it("preserves remoteBroadcasts when hello has no broadcasts field", () => {
      const client = new AutopushClient({ ...defaultOpts(), remoteBroadcasts: { key: "val" } });
      void client.connect();
      const ws = latestWs();
      ws.simulateOpen();
      ws.simulateMessage({ messageType: "hello", uaid: "u" });
      expect(client.getRemoteBroadcasts()).toEqual({ key: "val" });
    });
  });
});
