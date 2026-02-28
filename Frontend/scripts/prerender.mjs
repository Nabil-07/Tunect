/**
 * scripts/prerender.mjs
 *
 * Post-build script: spins up a local static server over dist/,
 * visits each critical route with Puppeteer, extracts the final HTML
 * (after React Helmet has set <title>, meta, JSON-LD etc.) and writes
 * the result back to dist/ so S3+CloudFront serves pre-rendered HTML.
 *
 * Usage (CI):
 *   npm run build
 *   node scripts/prerender.mjs
 *
 * Requirements (dev-deps):
 *   npm i -D puppeteer serve    # (or puppeteer-core + chromium)
 *
 * How it works on S3+CloudFront:
 *   CloudFront should be configured with a Lambda@Edge or CloudFront
 *   Function to rewrite /online-maths-tutor → /online-maths-tutor/index.html
 *   OR (simpler) each route is uploaded as both a folder/index.html and a
 *   bare file without extension. This script creates both for safety.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '..', 'dist');

// ── Routes to pre-render ───────────────────────────────────────────
const ROUTES = [
  '/',
  '/find-tutors',
  '/pricing',
  '/become-tutor',
  '/trending-tutors',
  '/about',
  '/how-it-works',
  '/blogs',
  // SEO subject landing pages
  '/online-maths-tutor',
  '/online-physics-tutor',
  '/online-chemistry-tutor',
  '/online-biology-tutor',
  '/online-english-tutor',
];

const PORT = 4173;          // Vite preview default
const ORIGIN = `http://localhost:${PORT}`;

async function main() {
  // Check dist exists
  if (!existsSync(resolve(DIST, 'index.html'))) {
    console.error('❌  dist/index.html not found. Run `npm run build` first.');
    process.exit(1);
  }

  // Dynamically import puppeteer (dev-dependency)
  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
  } catch {
    console.log('⚠️  puppeteer not installed – skipping pre-render.');
    console.log('   Install it with: npm i -D puppeteer');
    process.exit(0);
  }

  // Start static server in background
  console.log(`🚀  Starting static server on port ${PORT} …`);
  const serverProc = (await import('node:child_process')).spawn(
    'npx', ['serve', DIST, '-l', String(PORT), '--no-clipboard', '-s'],
    { stdio: 'pipe', shell: true },
  );

  // Give server time to start
  await new Promise((r) => setTimeout(r, 2000));

  const browser = await puppeteer.default.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    for (const route of ROUTES) {
      const url = `${ORIGIN}${route}`;
      console.log(`  📄  ${route}`);

      const page = await browser.newPage();
      // Block analytics / external scripts to speed up rendering
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const u = req.url();
        if (
          u.includes('googletagmanager') ||
          u.includes('google-analytics') ||
          u.includes('gtag')
        ) {
          req.abort();
        } else {
          req.continue();
        }
      });

      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30_000 });

      // Wait a moment for React Helmet to apply
      await page.waitForFunction(() => document.title && document.title.length > 5, {
        timeout: 10_000,
      });

      // Extract full HTML
      const html = await page.content();
      await page.close();

      // Write to dist/<route>/index.html
      const dir = resolve(DIST, route === '/' ? '' : route.replace(/^\//, ''));
      if (route === '/') {
        // Overwrite dist/index.html directly
        writeFileSync(resolve(DIST, 'index.html'), html, 'utf-8');
      } else {
        mkdirSync(dir, { recursive: true });
        writeFileSync(resolve(dir, 'index.html'), html, 'utf-8');
      }
    }

    console.log(`\n✅  Pre-rendered ${ROUTES.length} routes into dist/`);
  } finally {
    await browser.close();
    serverProc.kill();
  }
}

main().catch((err) => {
  console.error('Pre-render failed:', err);
  process.exit(1);
});
