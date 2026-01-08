import { Injectable, Logger } from '@nestjs/common';

export interface PiiDetectionResult {
  isClean: boolean;
  violations: PiiViolation[];
  redactedContent?: string;
}

export interface PiiViolation {
  type: 'phone' | 'email' | 'url' | 'social' | 'obfuscated';
  matched: string;
  context: string;
}

@Injectable()
export class PiiGuardService {
  private readonly logger = new Logger(PiiGuardService.name);

  // Allowed domains (your own domains)
  private readonly allowedDomains = [
    'tunectnow.com',
    'localhost',
    'tunect.in',
  ];

  // Phone number patterns (various formats)
  private readonly phonePatterns = [
    /\b\d{10}\b/g, // 1234567890
    /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, // 123-456-7890, 123.456.7890, 123 456 7890
    /\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, // International formats
    /\b\d{5}[-.\s]\d{5}\b/g, // 12345-67890 (Indian format)
  ];

  // Email patterns
  private readonly emailPatterns = [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // standard email
    /\b[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9.-]+\s*\.\s*[A-Z|a-z]{2,}\b/gi, // spaced email
  ];

  // URL patterns
  private readonly urlPatterns = [
    /https?:\/\/[^\s]+/gi,
    /www\.[^\s]+/gi,
    /\b[a-z0-9-]+\.(com|org|net|in|co|io|app|dev|xyz|me|info|biz|us|uk|ca)\b/gi,
  ];

  // Social media patterns
  private readonly socialPatterns = [
    /\b(whatsapp|telegram|signal|viber|wechat|line)\s*:?\s*[^\s]+/gi,
    /\b(instagram|insta|fb|facebook|twitter|x\.com|snapchat|snap|tiktok|linkedin)\s*:?\s*[^\s]+/gi,
    /\b@[a-z0-9_.-]+/gi, // @handles
    /\b(dm\s+me|message\s+me|contact\s+me|reach\s+me|find\s+me)\s+(on|at|via)\s+[^\s]+/gi,
  ];

  // Obfuscation patterns (attempts to bypass)
  private readonly obfuscationPatterns = [
    /\b(at)\s+(gmail|yahoo|hotmail|outlook|proton|icloud|mail|email)/gi,
    /\b(dot)\s+(com|org|net|in|co|io)/gi,
    /\b(nine|eight|seven|six|five|four|three|two|one|zero)[\s-]+(nine|eight|seven|six|five|four|three|two|one|zero)/gi,
    /\b\d[\s._-]+\d[\s._-]+\d[\s._-]+\d[\s._-]+\d/g, // spaced digits
    /\b(call|text|msg|message|contact)\s+me\s+(?:at|on)?\s*\d/gi,
  ];

  /**
   * Detect PII in content
   */
  detectPii(content: string): PiiDetectionResult {
    if (!content || content.trim().length === 0) {
      return { isClean: true, violations: [] };
    }

    const violations: PiiViolation[] = [];

    // Check phones
    this.phonePatterns.forEach((pattern) => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          violations.push({
            type: 'phone',
            matched: match,
            context: this.getContext(content, match),
          });
        });
      }
    });

    // Check emails
    this.emailPatterns.forEach((pattern) => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          violations.push({
            type: 'email',
            matched: match,
            context: this.getContext(content, match),
          });
        });
      }
    });

    // Check URLs (and filter out allowed domains)
    this.urlPatterns.forEach((pattern) => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          if (!this.isAllowedDomain(match)) {
            violations.push({
              type: 'url',
              matched: match,
              context: this.getContext(content, match),
            });
          }
        });
      }
    });

    // Check social media
    this.socialPatterns.forEach((pattern) => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          violations.push({
            type: 'social',
            matched: match,
            context: this.getContext(content, match),
          });
        });
      }
    });

    // Check obfuscation attempts
    this.obfuscationPatterns.forEach((pattern) => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          violations.push({
            type: 'obfuscated',
            matched: match,
            context: this.getContext(content, match),
          });
        });
      }
    });

    // Remove duplicates
    const uniqueViolations = this.deduplicateViolations(violations);

    if (uniqueViolations.length > 0) {
      this.logger.warn(
        `PII detected: ${uniqueViolations.length} violation(s) in content`,
      );
    }

    return {
      isClean: uniqueViolations.length === 0,
      violations: uniqueViolations,
      redactedContent: this.redactContent(content, uniqueViolations),
    };
  }

  /**
   * Check if a URL contains an allowed domain
   */
  private isAllowedDomain(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    return this.allowedDomains.some((domain) => lowerUrl.includes(domain));
  }

  /**
   * Get context around matched text (for logging)
   */
  private getContext(content: string, match: string): string {
    const index = content.indexOf(match);
    const start = Math.max(0, index - 20);
    const end = Math.min(content.length, index + match.length + 20);
    return `...${content.substring(start, end)}...`;
  }

  /**
   * Deduplicate violations (same type + overlapping matches)
   */
  private deduplicateViolations(
    violations: PiiViolation[],
  ): PiiViolation[] {
    const seen = new Set<string>();
    return violations.filter((v) => {
      const key = `${v.type}:${v.matched.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Redact PII from content (replace with [REDACTED])
   */
  private redactContent(
    content: string,
    violations: PiiViolation[],
  ): string {
    let redacted = content;
    violations.forEach((v) => {
      const regex = new RegExp(
        v.matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'gi',
      );
      redacted = redacted.replace(regex, '[REDACTED]');
    });
    return redacted;
  }

  /**
   * Get warning message based on user role
   */
  getWarningMessage(role: 'STUDENT' | 'TUTOR'): string {
    if (role === 'TUTOR') {
      return `⚠️ WARNING: Sharing personal contact information (phone, email, social media) is strictly prohibited. Violations will result in immediate account suspension, earnings being blocked, and funds will not be disbursed. This message was blocked.`;
    } else {
      return `⚠️ WARNING: Sharing personal contact information (phone, email, social media) is strictly prohibited. Violations will result in immediate account suspension. You will not be allowed to attend classes even with available tokens. This message was blocked.`;
    }
  }
}
