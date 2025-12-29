import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface AiScanResult {
  isClean: boolean;
  flaggedReasons: string[];
  confidence: number;
}

export interface SessionSummary {
  aiSummary: string;
  keyPoints: string[];
  homeworkSuggestions: string[];
}

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly openai: OpenAI | null;
  private readonly isEnabled: boolean;
  private readonly model: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.isEnabled = !!apiKey && this.configService.get<string>('ENABLE_OPENAI') === 'true';
    this.model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';

    if (this.isEnabled && apiKey) {
      this.openai = new OpenAI({ apiKey });
      this.logger.log(`OpenAI Service initialized with model: ${this.model}`);
    } else {
      this.openai = null;
      this.logger.warn('OpenAI Service is disabled. Set ENABLE_OPENAI=true and provide OPENAI_API_KEY.');
    }
  }

  /**
   * Scan text content for contact information (emails, phones, social media)
   * Used for assignment safety scanning
   */
  async scanForContactInfo(text: string): Promise<AiScanResult> {
    if (!text || text.trim().length === 0) {
      return {
        isClean: true,
        flaggedReasons: [],
        confidence: 1.0,
      };
    }

    // First: Regex-based detection (fast, reliable)
    const regexFlags = this.regexScan(text);

    if (!this.isEnabled || !this.openai) {
      // If OpenAI is disabled, rely only on regex
      return {
        isClean: regexFlags.length === 0,
        flaggedReasons: regexFlags,
        confidence: 0.8, // Lower confidence without AI
      };
    }

    // Second: AI-based detection (more sophisticated)
    try {
      const prompt = `You are a content moderation AI. Analyze the following text and detect if it contains:
1. Phone numbers (any format)
2. Email addresses
3. WhatsApp, Telegram, or other messaging app contact info
4. Social media handles or usernames
5. Links to external communication platforms

Text to analyze:
"""
${text.substring(0, 5000)}
"""

Respond in JSON format:
{
  "hasContactInfo": true/false,
  "detectedTypes": ["phone", "email", "whatsapp", etc.],
  "confidence": 0.0-1.0
}`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 300,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const aiResult = JSON.parse(content);

      const allFlags = [...new Set([...regexFlags, ...(aiResult.detectedTypes || [])])];

      return {
        isClean: !aiResult.hasContactInfo && regexFlags.length === 0,
        flaggedReasons: allFlags,
        confidence: aiResult.confidence || 0.9,
      };
    } catch (error) {
      this.logger.error('OpenAI scan error:', error);
      // Fallback to regex results
      return {
        isClean: regexFlags.length === 0,
        flaggedReasons: regexFlags,
        confidence: 0.7,
      };
    }
  }

  /**
   * Generate AI session notes
   */
  async generateSessionNotes(input: {
    chatMessages?: string[];
    tutorNotes?: string;
    sessionTopic?: string;
    duration?: number;
  }): Promise<SessionSummary> {
    if (!this.isEnabled || !this.openai) {
      // Mock response when AI is disabled
      return {
        aiSummary: 'AI session notes are currently disabled.',
        keyPoints: ['Enable OPENAI service to generate automated notes'],
        homeworkSuggestions: [],
      };
    }

    try {
      const context = this.buildSessionContext(input);

      const prompt = `You are an educational AI assistant. Based on the following tutoring session information, generate a comprehensive session summary.

${context}

Generate a JSON response with:
{
  "summary": "A 2-3 sentence overview of what was covered",
  "keyPoints": ["point 1", "point 2", ...],
  "homeworkSuggestions": ["suggestion 1", "suggestion 2", ...]
}`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 800,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const result = JSON.parse(content);

      return {
        aiSummary: result.summary || 'Session completed successfully.',
        keyPoints: result.keyPoints || [],
        homeworkSuggestions: result.homeworkSuggestions || [],
      };
    } catch (error) {
      this.logger.error('OpenAI session notes error:', error);
      return {
        aiSummary: 'Failed to generate AI summary.',
        keyPoints: [],
        homeworkSuggestions: [],
      };
    }
  }

  /**
   * Regex-based contact info detection (backup/primary method)
   */
  private regexScan(text: string): string[] {
    const flags: string[] = [];

    // Phone numbers (various formats)
    const phonePatterns = [
      /\b\d{10}\b/g, // 10 digits
      /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, // xxx-xxx-xxxx
      /\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, // International
    ];

    for (const pattern of phonePatterns) {
      if (pattern.test(text)) {
        flags.push('phone_number');
        break;
      }
    }

    // Email addresses
    if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g.test(text)) {
      flags.push('email');
    }

    // WhatsApp
    if (/whatsapp|wa\.me|chat\.whatsapp/gi.test(text)) {
      flags.push('whatsapp');
    }

    // Telegram
    if (/telegram|t\.me|@[\w_]+/gi.test(text)) {
      flags.push('telegram');
    }

    // Discord
    if (/discord|discord\.gg|discord\.com/gi.test(text)) {
      flags.push('discord');
    }

    return flags;
  }

  /**
   * Build context string for session notes
   */
  private buildSessionContext(input: {
    chatMessages?: string[];
    tutorNotes?: string;
    sessionTopic?: string;
    duration?: number;
  }): string {
    const parts: string[] = [];

    if (input.sessionTopic) {
      parts.push(`Topic: ${input.sessionTopic}`);
    }

    if (input.duration) {
      parts.push(`Duration: ${input.duration} minutes`);
    }

    if (input.tutorNotes) {
      parts.push(`Tutor's Notes:\n${input.tutorNotes}`);
    }

    if (input.chatMessages && input.chatMessages.length > 0) {
      const recentMessages = input.chatMessages.slice(-20).join('\n');
      parts.push(`Chat Messages:\n${recentMessages}`);
    }

    return parts.join('\n\n');
  }
}
