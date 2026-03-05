/**
 * Grade display compaction utility.
 *
 * Converts verbose grade lists into compact range notation:
 *   "1,2,3,4,5,6,7,8,9,10" → "Grade 1-10"
 *   "1,2,3,6,7,8,9,10"     → "Grade 1-3, Grade 6-10"
 *   "Grade 1 to 10"         → "Grade 1-10"
 */

/**
 * Parse a classRange string (e.g. "Grade 6-8", "1,2,3,4,5", "grade 1 to 10")
 * into an array of individual grade numbers. Returns empty array if not parsable.
 */
export function parseGradeNumbers(input: string): number[] {
  if (!input) return [];
  const trimmed = input.trim();

  // Skip obviously non-numeric grade labels (University, A-Level, Uni, etc.)
  // Only proceed if the string starts with Grade/Class/Std/Standard + digit, or is purely numeric
  const looksNumeric = /^\s*(?:Grade|Class|Std|Standard)\s*\d/i.test(trimmed)
    || /^\d[\d,;\s-]+$/.test(trimmed);
  if (!looksNumeric) return [];

  // "Grade 6-8", "Class 1-10", "grade 6 to 8"
  const rangeMatch = /(?:Grade|Class)\s*(\d+)\s*[-–to]+\s*(\d+)/i.exec(trimmed);
  if (rangeMatch) {
    const lo = Number.parseInt(rangeMatch[1], 10);
    const hi = Number.parseInt(rangeMatch[2], 10);
    const grades: number[] = [];
    for (let g = Math.min(lo, hi); g <= Math.max(lo, hi); g++) grades.push(g);
    return grades;
  }

  // Comma-separated: "1,2,3,4,5" or "Grade 1, Grade 2, Grade 3"
  const commaParts = trimmed.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  if (commaParts.length > 1) {
    const nums = commaParts
      .map((p) => {
        const m = /(\d+)/.exec(p);
        return m ? Number.parseInt(m[1], 10) : Number.NaN;
      })
      .filter((n) => !Number.isNaN(n));
    if (nums.length > 0) return [...new Set(nums)].sort((a, b) => a - b);
  }

  // Single number: "Grade 5" or "5"
  const singleMatch = /(\d+)/.exec(trimmed);
  if (singleMatch) return [Number.parseInt(singleMatch[1], 10)];

  return [];
}

/**
 * Compact an array of grade numbers into range strings.
 * e.g. [1,2,3,6,7,8,9,10] → "Grade 1-3, Grade 6-10"
 *      [5]                 → "Grade 5"
 *      [1,2,3,4,5,6,7,8,9,10] → "Grade 1-10"
 */
export function compactGradeNumbers(grades: number[]): string {
  if (!grades.length) return '';
  const sorted = [...new Set(grades)].sort((a, b) => a - b);

  const ranges: [number, number][] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push([start, end]);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push([start, end]);

  return ranges
    .map(([lo, hi]) => (lo === hi ? `Grade ${lo}` : `Grade ${lo}-${hi}`))
    .join(', ');
}

/**
 * Auto-compact a classRange string.
 * "1,2,3,4,5,6,7,8,9,10" → "Grade 1-10"
 * "1,2,3,6,7,8,9,10"     → "Grade 1-3, Grade 6-10"
 * "Grade 6-8"             → "Grade 6-8" (already compact)
 * Non-numeric input is returned as-is.
 */
export function compactClassRange(input: string): string {
  if (!input) return input;
  const grades = parseGradeNumbers(input);
  if (grades.length === 0) return input; // non-numeric, keep as-is
  return compactGradeNumbers(grades);
}
