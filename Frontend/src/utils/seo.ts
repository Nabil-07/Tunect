/**
 * SEO utility functions
 */

const BASE_URL = import.meta.env.VITE_APP_URL || 'https://tunectnow.com';

/**
 * Generate a URL-friendly slug from tutor data
 * Format: firstname-lastname-subject-city
 */
export function generateTutorSlug(tutor: {
  name?: string;
  subject?: string;
  subjects?: string[];
  country?: string;
  id: string;
}): string {
  const parts: string[] = [];

  // Name: split and take first 2 words
  if (tutor.name) {
    const nameParts = tutor.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .slice(0, 2);
    parts.push(...nameParts);
  }

  // Subject: use first subject or primary subject
  const subject = tutor.subjects?.[0] || tutor.subject;
  if (subject) {
    parts.push(
      subject
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
    );
  }

  // City/Country: use country if available
  if (tutor.country) {
    parts.push(
      tutor.country
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
    );
  }

  // Fallback to ID if no meaningful parts
  if (parts.length === 0) {
    parts.push('tutor');
  }

  // Add ID suffix for uniqueness
  const slug = parts.join('-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${slug}-${tutor.id.slice(-8)}`;
}

/**
 * Parse tutor ID from slug (backward compatibility)
 */
export function parseTutorIdFromSlug(slug: string): string | null {
  // If it's already an ID (cuid format, typically 25 chars), return as-is
  if (slug.length > 20 && /^[a-z0-9]+$/.test(slug)) {
    return slug;
  }

  // Extract ID from slug (last part after last dash)
  const parts = slug.split('-');
  const lastPart = parts[parts.length - 1];
  
  // If last part looks like a CUID (starts with 'c' and is 25 chars), return it
  if (lastPart && lastPart.length === 25 && /^c[a-z0-9]{24}$/.test(lastPart)) {
    return lastPart;
  }
  
  // Otherwise, return the last part (backend will handle lookup with endsWith)
  if (lastPart && lastPart.length >= 8) {
    return lastPart;
  }

  return null;
}

/**
 * Get canonical URL for a page
 */
export function getCanonicalUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_URL}${cleanPath}`;
}

/**
 * Default OG image
 */
export const DEFAULT_OG_IMAGE = `${BASE_URL}/tunect_logo_hd.png`;
