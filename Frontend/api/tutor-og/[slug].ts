import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync } from 'fs';
import { join } from 'path';

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildOgTags(title: string, description: string, image: string, url: string): string {
  const t = escapeAttr(title);
  const d = escapeAttr(description);
  const i = escapeAttr(image);
  const u = escapeAttr(url);
  return [
    `<meta property="og:type" content="profile" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:image" content="${i}" />`,
    `<meta property="og:image:width" content="400" />`,
    `<meta property="og:image:height" content="400" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:site_name" content="Tunect" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${i}" />`,
  ].join('\n    ');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const slug = (req.query.slug as string) || '';

  // Extract tutor ID from slug (last segment after last hyphen)
  const parts = slug.split('-');
  const tutorId = parts[parts.length - 1];

  // Fetch tutor data from public API
  const apiUrl = process.env.API_URL || 'https://api.tunectnow.com';
  const frontendUrl = (process.env.FRONTEND_URL || 'https://tunectnow.com').replace(/\/+$/, '');
  let tutor: any = null;

  if (tutorId) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${apiUrl}/tutors/${encodeURIComponent(tutorId)}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (response.ok) {
        tutor = await response.json();
      }
    } catch {
      // Proceed with defaults if API fails
    }
  }

  // Build OG values from tutor data
  const name = tutor?.name || 'Online Tutor';
  const bio = tutor?.bio || tutor?.summary || '';
  const description = bio
    ? bio.substring(0, 200).replace(/[\n\r]+/g, ' ')
    : 'Online tutoring with verified tutors. Book 1-on-1 sessions on Tunect.';
  const image = tutor?.avatarUrl || `${frontendUrl}/tunect_logo_hd_main.png`;
  const subjects = tutor?.subjects?.join(', ') || tutor?.subject || '';
  const title = `${name}${subjects ? ` - ${subjects}` : ''} | Tunect`;
  const pageUrl = `${frontendUrl}/tutors/${slug}`;

  // Read the built index.html and inject OG tags
  let html: string;
  try {
    html = readFileSync(join(process.cwd(), 'dist', 'index.html'), 'utf-8');
  } catch {
    // Fallback: serve minimal OG page that redirects browsers to the SPA
    const ogTags = buildOgTags(title, description, image, pageUrl);
    html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeAttr(title)}</title>
  <meta name="description" content="${escapeAttr(description)}" />
  ${ogTags}
  <link rel="icon" href="/tunect_logo_hd_main.png" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }

  const ogTags = buildOgTags(title, description, image, pageUrl);

  // Replace title and description, inject OG tags
  html = html.replace(/<title>.*?<\/title>/, `<title>${escapeAttr(title)}</title>`);
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${escapeAttr(description)}" />`,
  );
  html = html.replace('</head>', `    ${ogTags}\n  </head>`);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  return res.send(html);
}
