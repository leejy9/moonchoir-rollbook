#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const ARTIFACT_DIR = '/Users/grasshop/.gemini/antigravity/brain/a232c221-998d-4326-9078-3a722f9dec52';
const OUT_DIR = path.resolve('screenshots');
const OUT_ARTIFACT_DIR = path.join(ARTIFACT_DIR, 'screenshots');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(OUT_ARTIFACT_DIR, { recursive: true });

async function tryPlaywright() {
  try {
    const pw = await import('playwright');
    console.log('[capture-screens] Found playwright module.');
    return pw;
  } catch (err) {
    console.log(`[capture-screens] Playwright not found: ${err?.message || err}`);
    console.log('[capture-screens] Attempted import("playwright"), falling back to installed Google Chrome...');
    return null;
  }
}

function findChromeBinary() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    'google-chrome',
    'chromium',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function serveDist(port) {
  const distDir = path.resolve('dist');
  if (!fs.existsSync(distDir)) {
    throw new Error('dist directory does not exist. Run "npm run build" first.');
  }

  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
  };

  const server = http.createServer((req, res) => {
    let filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

function runCommand(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: 'inherit' });
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${bin} exited with code ${code}`));
    });
    p.on('error', reject);
  });
}

async function main() {
  console.log('=== scripts/dev/capture-screens.mjs ===');
  const pw = await tryPlaywright();
  const chromeBin = findChromeBinary();

  const port = 4173;
  const server = await serveDist(port);
  console.log(`[capture-screens] Serving dist on http://127.0.0.1:${port}`);

  const targets = [
    { name: 'profile-390x844.png', url: `http://127.0.0.1:${port}/#profile`, width: 390, height: 844 },
    { name: 'studio-390x844.png', url: `http://127.0.0.1:${port}/#studio`, width: 390, height: 844 },
  ];

  try {
    if (pw) {
      console.log('[capture-screens] Capturing with Playwright...');
      const browser = await pw.chromium.launch();
      for (const t of targets) {
        const page = await browser.newPage({ viewport: { width: t.width, height: t.height } });
        await page.goto(t.url, { waitUntil: 'networkidle' });
        const localPath = path.join(OUT_DIR, t.name);
        const artPath = path.join(OUT_ARTIFACT_DIR, t.name);
        await page.screenshot({ path: localPath });
        fs.copyFileSync(localPath, artPath);
        console.log(`[capture-screens] Saved: ${localPath} -> ${artPath}`);
        await page.close();
      }
      await browser.close();
    } else if (chromeBin) {
      console.log(`[capture-screens] Capturing with Google Chrome: ${chromeBin}`);
      for (const t of targets) {
        const localPath = path.join(OUT_DIR, t.name);
        const artPath = path.join(OUT_ARTIFACT_DIR, t.name);
        await runCommand(chromeBin, [
          '--headless=new',
          `--screenshot=${localPath}`,
          `--window-size=${t.width},${t.height}`,
          '--virtual-time-budget=2000',
          '--hide-scrollbars',
          t.url,
        ]);
        if (fs.existsSync(localPath)) {
          fs.copyFileSync(localPath, artPath);
          console.log(`[capture-screens] Saved: ${localPath} -> ${artPath}`);
        } else {
          console.warn(`[capture-screens] Failed to create ${localPath}`);
        }
      }
    } else {
      console.warn('[capture-screens] Neither Playwright nor Google Chrome found.');
    }
  } finally {
    server.close();
    console.log('[capture-screens] Done.');
  }
}

main().catch((err) => {
  console.error('[capture-screens] Error:', err);
  process.exit(1);
});
