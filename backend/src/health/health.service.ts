import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

type ServiceStatus = 'up' | 'down';

export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface HealthResponse {
  status: HealthStatus;
  services: {
    database: ServiceStatus;
    livekit: ServiceStatus;
  };
  uptime: number;
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startTime = Date.now();
  private readonly externalCheckTimeout = 3000; // 3 seconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Check PostgreSQL connection via Prisma.
   */
  async checkDatabase(): Promise<ServiceStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch (error) {
      this.logger.warn('Database health check failed', error);
      return 'down';
    }
  }

  /**
   * Check LiveKit service availability with timeout.
   * Pings the LiveKit host URL (HTTPS).
   */
  async checkLiveKit(): Promise<ServiceStatus> {
    const host = this.config.get<string>('LIVEKIT_HOST');
    if (!host) {
      this.logger.debug('LIVEKIT_HOST not configured, skipping LiveKit check');
      return 'down'; // Treat missing config as down
    }

    try {
      // Extract hostname from wss:// or https:// URL
      let url: string;
      if (host.startsWith('wss://')) {
        url = host.replace('wss://', 'https://');
      } else if (host.startsWith('https://')) {
        url = host;
      } else {
        url = `https://${host}`;
      }

      // Ensure we have a valid URL for health check
      const healthUrl = `${url.replace(/\/$/, '')}/`;

      // Use AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.externalCheckTimeout);

      try {
        const response = await fetch(healthUrl, {
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Tunect-Health-Check/1.0',
          },
        });
        clearTimeout(timeoutId);

        // Accept 2xx, 3xx, 401 (auth required), 404 (endpoint might not exist but server is up)
        if (response.status >= 200 && response.status < 500) {
          return 'up';
        }
        return 'down';
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          this.logger.warn(`LiveKit health check timed out after ${this.externalCheckTimeout}ms`);
        } else {
          this.logger.warn('LiveKit health check failed', fetchError.message);
        }
        return 'down';
      }
    } catch (error) {
      this.logger.warn('LiveKit health check error', error);
      return 'down';
    }
  }

  /**
   * Get process uptime in seconds.
   */
  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get memory usage statistics (safe, no sensitive data).
   */
  getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: usage.rss, // Resident Set Size (total memory allocated)
      heapTotal: usage.heapTotal, // Total heap allocated
      heapUsed: usage.heapUsed, // Heap actually used
      external: usage.external, // C++ objects bound to JS objects
    };
  }

  /**
   * Perform all health checks and return comprehensive status.
   */
  async check(): Promise<HealthResponse> {
    const [database, livekit] = await Promise.all([
      this.checkDatabase(),
      this.checkLiveKit(),
    ]);

    // Determine overall status
    let status: HealthStatus;
    if (database === 'down') {
      status = 'down'; // Database is critical
    } else if (livekit === 'down') {
      status = 'degraded'; // LiveKit is non-critical but important
    } else {
      status = 'ok';
    }

    return {
      status,
      services: {
        database,
        livekit,
      },
      uptime: this.getUptime(),
      memoryUsage: this.getMemoryUsage(),
    };
  }
}
