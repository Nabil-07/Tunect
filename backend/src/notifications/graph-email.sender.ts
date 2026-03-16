import { Logger } from '@nestjs/common';

export type EmailAttachment = {
  filename: string;
  /** Base64-encoded file content */
  contentBase64: string;
  contentType: string;
};

export type GraphEmailSenderConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  senderUpn: string; // e.g. no-reply@tunectnow.com
  saveToSentItems?: boolean;
};

type TokenCache = {
  accessToken: string;
  // epoch millis
  expiresAt: number;
};

export class GraphEmailSender {
  private readonly logger: Logger;
  private readonly config: GraphEmailSenderConfig;
  private tokenCache?: TokenCache;

  constructor(config: GraphEmailSenderConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger ?? new Logger(GraphEmailSender.name);
  }

  static fromEnv(logger?: Logger): GraphEmailSender | null {
    const enabled = (process.env.ENABLE_GRAPH_EMAIL ?? '').toLowerCase() === 'true';
    if (!enabled) return null;

    const tenantId = process.env.GRAPH_TENANT_ID;
    const clientId = process.env.GRAPH_CLIENT_ID;
    const clientSecret = process.env.GRAPH_CLIENT_SECRET;
    const senderUpn = process.env.GRAPH_SENDER_UPN;

    if (!tenantId || !clientId || !clientSecret || !senderUpn) {
      logger?.warn(
        'Graph email is enabled but not fully configured. Missing: ' +
          `${!tenantId ? 'GRAPH_TENANT_ID ' : ''}` +
          `${!clientId ? 'GRAPH_CLIENT_ID ' : ''}` +
          `${!clientSecret ? 'GRAPH_CLIENT_SECRET ' : ''}` +
          `${!senderUpn ? 'GRAPH_SENDER_UPN' : ''}`,
      );
      return null;
    }

    const saveToSentItems =
      (process.env.GRAPH_SAVE_TO_SENT_ITEMS ?? '').toLowerCase() === 'true';

    return new GraphEmailSender(
      { tenantId, clientId, clientSecret, senderUpn, saveToSentItems },
      logger,
    );
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    // Refresh token 60s early
    if (this.tokenCache && this.tokenCache.expiresAt - now > 60_000) {
      return this.tokenCache.accessToken;
    }

    const url = `https://login.microsoftonline.com/${encodeURIComponent(
      this.config.tenantId,
    )}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    });

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const json: any = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const msg =
        json?.error_description || json?.error || `token request failed (${resp.status})`;
      throw new Error(`Graph token error: ${msg}`);
    }

    const token = json?.access_token as string | undefined;
    const expiresIn = Number(json?.expires_in ?? 0);

    if (!token || !expiresIn) {
      throw new Error('Graph token error: missing access_token/expires_in');
    }

    this.tokenCache = {
      accessToken: token,
      expiresAt: Date.now() + expiresIn * 1000,
    };

    return token;
  }

  async sendHtmlEmail(to: string, subject: string, html: string): Promise<void> {
    return this.sendHtmlEmailWithAttachments(to, subject, html);
  }

  async sendHtmlEmailWithAttachments(
    to: string,
    subject: string,
    html: string,
    attachments: EmailAttachment[] = [],
  ): Promise<void> {
    const token = await this.getAccessToken();

    const endpoint = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      this.config.senderUpn,
    )}/sendMail`;

    const graphAttachments = attachments.map((a) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.filename,
      contentType: a.contentType,
      contentBytes: a.contentBase64,
    }));

    const payload: Record<string, any> = {
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: to } }],
        ...(graphAttachments.length > 0 ? { attachments: graphAttachments } : {}),
      },
      saveToSentItems: Boolean(this.config.saveToSentItems),
    };

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (resp.status === 202) return;

    const text = await resp.text().catch(() => '');
    throw new Error(
      `Graph sendMail failed (${resp.status}) ${resp.statusText}: ${text}`,
    );
  }
}
