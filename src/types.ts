export interface Config {
  uaid: string;
  channelId: string;
  endpoint: string;
  remoteBroadcasts: Record<string, string>;
  decryptor: {
    jwk: JsonWebKey;
    auth: string; // base64url
  };
  twitter: {
    cookies: Record<string, string>;
  };
}

export interface AutopushNotification {
  messageType: "notification";
  channelID: string;
  version: string;
  data: string; // base64url encoded encrypted payload
  headers: {
    crypto_key: string;
    encryption: string;
  };
}

export interface TwitterNotification {
  title: string;
  body: string;
  icon?: string;
  timestamp?: number;
  tag?: string;
  data?: {
    type?: string;
    uri?: string;
    title?: string;
    body?: string;
    tag?: string;
    lang?: string;
    bundle_text?: string;
    scribe_target?: string;
    impression_id?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface NotificationHandler {
  handle(notification: TwitterNotification): void | Promise<void>;
}

export interface ClientState {
  uaid: string;
  channelId: string;
  endpoint: string;
  remoteBroadcasts: Record<string, string>;
  decryptor: {
    jwk: JsonWebKey;
    auth: string; // base64url
  };
}

export interface NotificationClientOptions {
  cookies: { auth_token: string; ct0: string };
  state?: ClientState;
}
