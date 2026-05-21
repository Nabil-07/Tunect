import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import http from 'node:http';
import https from 'node:https';

export interface ChatResult {
  answer: string;
  thread_id: string;
}

@Injectable()
export class ChatbotService {
  private readonly _logger = new Logger(ChatbotService.name);
  private readonly baseUrl: string;

  constructor(private config: ConfigService) {
    this.baseUrl = this.config.get<string>('CHATBOT_URL', 'http://localhost:8000');
  }

  async sendMessage(
    message: string,
    role: string,
    jwtToken: string,
    threadId?: string,
  ): Promise<ChatResult> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ message, role, jwt_token: jwtToken, thread_id: threadId });
      const url = new URL('/chat', this.baseUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 30_000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: string) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data) as ChatResult;
              resolve(parsed);
            } catch {
              reject(new Error(`Invalid JSON from chatbot: ${data}`));
            }
          });
        },
      );

      req.on('error', (err) => this._logger.error('Chatbot request failed', err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Chatbot request timed out'));
      });
      req.write(body);
      req.end();
    });
  }
}