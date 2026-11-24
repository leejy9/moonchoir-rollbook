#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildSeed, NOW_ISO } from './capture-seed.mjs';

const ARTIFACT_DIR = '/Users/grasshop/.gemini/antigravity/brain/a232c221-998d-4326-9078-3a722f9dec52';
const OUT_DIR = path.resolve('screenshots');
const OUT_ARTIFACT_DIR = path.join(ARTIFACT_DIR, 'screenshots');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(OUT_ARTIFACT_DIR, { recursive: true });

async function tryPlaywright() {
  try {
    // 프로젝트에 설치하지 않은 경우 PLAYWRIGHT_MODULE_DIR(다른 곳에 있는 playwright 폴더)을 쓴다.
    const dir = process.env.PLAYWRIGHT_MODULE_DIR;
    const pw = dir
      ? await import(pathToFileURL(path.join(dir, 'index.mjs')).href)
      : await import('playwright');
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

const STORAGE = {
  profile: 'moonchoir_bound_device_v1',
  members: 'moonchoir_members_v3',
  schedules: 'moonchoir_schedules_v3',
  votes: 'moonchoir_rsvp_votes_v3',
  comments: 'moonchoir_comments_v3',
  seen: 'moonchoir_pref_seen_comments_v1',
  dark: 'moonchoir_dark_mode_v1',
};

/** 새 페이지를 만들고 기기 저장값·시각·네트워크 차단을 건다(운영 서버로 요청이 나가지 않게). */
async function openHomePage(browser, port, opts) {
  const { width, height, dark = false, seen = '["c1"]', role = 'MEMBER', hash = '#/home' } = opts;
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light' });
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    return u.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  const seed = buildSeed({ role });
  await context.addInitScript(({ seed, keys, seen, dark }) => {
    if (localStorage.getItem('__seeded')) return;
    localStorage.setItem('__seeded', '1');
    localStorage.setItem(keys.profile, JSON.stringify(seed.profile));
    localStorage.setItem(keys.members, JSON.stringify(seed.members));
    localStorage.setItem(keys.schedules, JSON.stringify(seed.schedules));
    localStorage.setItem(keys.votes, JSON.stringify(seed.votes));
    localStorage.setItem(keys.comments, JSON.stringify(seed.comments));
    if (seen !== null) localStorage.setItem(keys.seen, seen);
    localStorage.setItem(keys.dark, String(dark));
  }, { seed, keys: STORAGE, seen, dark });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(NOW_ISO));
  await page.goto(`http://127.0.0.1:${port}/${hash}`, { waitUntil: 'load' });
  await page.waitForSelector('.home-tab-container', { timeout: 10000 });
  // 네트워크를 막아 생기는 '동기화 실패' 알림은 화면을 가리므로 캡처에서만 숨긴다.
  await page.addStyleTag({ content: '.sync-notice-stack, .sync-status-pill { display: none !important; }' });
  await page.waitForTimeout(500);
  return { page, context };
}

async function measure(page) {
  return page.evaluate(() => {
    const top = (sel, text) => {
      const el = [...document.querySelectorAll(sel)].find((e) => !text || e.textContent.trim() === text);
      return el ? Math.round(el.getBoundingClientRect().top) : null;
    };
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      upcomingTitleTop: top('.home-upcoming-title', '다가오는 일정'),
      firstUpcomingRowTop: top('.home-upcoming-row'),
      bottomNavTop: top('.bottom-nav'),
      calendarTop: top('.home-cal'),
      cardTop: top('.home-card-section'),
      headerHeight: Math.round(document.querySelector('.app-header')?.getBoundingClientRect().height ?? -1),
      settingsButton: !!document.querySelector('[aria-label="관리자 모드"]'),
      overflowers: [...document.querySelectorAll('body *')]
        .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.home-card-track'))
        .slice(0, 4).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}:${Math.round(e.getBoundingClientRect().right)}`),
    };
  });
}

async function shot(page, name, tag) {
  const localPath = path.join(OUT_DIR, name);
  await page.screenshot({ path: localPath });
  fs.copyFileSync(localPath, path.join(OUT_ARTIFACT_DIR, name));
  console.log(`[capture-screens] ${tag ?? name}: ${JSON.stringify(await measure(page))}`);
}

async function scrollCards(page, index) {
  await page.evaluate((i) => {
    const track = document.querySelector('.home-card-track');
    const item = track.children[i];
    track.scrollTo({ left: item.offsetLeft - (track.clientWidth - item.offsetWidth) / 2, behavior: 'instant' });
  }, index);
  await page.waitForTimeout(250);
}

/** 홈 화면 캡처와 빌드본 동작 확인(지시서 V3-22 §5 확인 방법). Playwright 경로 전용. */
async function captureHome(pw, port) {
  const browser = await pw.chromium.launch();
  try {
    for (const dark of [false, true]) {
      const mode = dark ? 'dark' : 'light';
      const { page, context } = await openHomePage(browser, port, { width: 390, height: 844, dark });
      await shot(page, `home-${mode}-card1-390x844.png`);
      await scrollCards(page, 1);
      await shot(page, `home-${mode}-card2-390x844.png`);
      await scrollCards(page, 2);
      await shot(page, `home-${mode}-card3-390x844.png`);
      const hi = await page.evaluate(() => [...document.querySelectorAll('.calendar-cell.highlight')].map((e) => e.textContent));
      console.log(`[capture-screens] ${mode} card2 달력 강조: ${JSON.stringify(hi)}`);
      await context.close();
    }

    // 일정 상세(새 댓글 있음): 저장값 ["c1"] → c2(남)만 새 댓글, c3(나)는 아님
    {
      const { page, context } = await openHomePage(browser, port, { width: 390, height: 844 });
      const dotBefore = await page.locator('.home-card-comment-dot').count();
      await page.locator('.home-card-comment-row').first().click();
      await page.waitForSelector('.sc-list', { timeout: 5000 });
      const labels = await page.locator('.sc-new').count();
      await page.waitForTimeout(300);
      await shot(page, 'detail-new-comment-390x844.png', 'detail-new-comment');
      console.log(`[capture-screens] 상세 "새 댓글" 글자 수=${labels}, 카드 점(열기 전)=${dotBefore}`);
      await page.getByRole('button', { name: '닫기' }).first().click();
      await page.waitForTimeout(400);
      console.log(`[capture-screens] 펼친 채 닫은 뒤 카드 점=${await page.locator('.home-card-comment-dot').count()} (기대 1: C 카드의 새 댓글은 남음)`);
      await context.close();
    }

    // 접고 닫기: 점이 그대로여야 한다
    {
      const { page, context } = await openHomePage(browser, port, { width: 390, height: 844 });
      await page.locator('.home-card-comment-row').first().click();
      await page.waitForSelector('.sc-toggle', { timeout: 5000 });
      await page.locator('.sc-toggle').click();
      await page.getByRole('button', { name: '닫기' }).first().click();
      await page.waitForTimeout(400);
      console.log(`[capture-screens] 접고 닫은 뒤 카드 점=${await page.locator('.home-card-comment-dot').count()} (기대 2: 열기 전과 같음)`);
      await context.close();
    }

    // 저장값이 깨졌을 때: 점도 없고 저장값도 그대로
    {
      const { page, context } = await openHomePage(browser, port, { width: 390, height: 844, seen: '{broken' });
      const dots = await page.locator('.home-card-comment-dot').count();
      await page.locator('.home-card-comment-row').first().click();
      await page.waitForSelector('.sc-list', { timeout: 5000 });
      await page.getByRole('button', { name: '닫기' }).first().click();
      await page.waitForTimeout(300);
      const stored = await page.evaluate((k) => localStorage.getItem(k), STORAGE.seen);
      console.log(`[capture-screens] 깨진 저장값: 점=${dots} (기대 0), 저장값=${stored} (기대 {broken)`);
      await context.close();
    }

    // 설정 버튼: MEMBER는 없음, ADMIN은 있음
    for (const role of ['MEMBER', 'ADMIN']) {
      const { page, context } = await openHomePage(browser, port, { width: 390, height: 844, role });
      console.log(`[capture-screens] role=${role} 설정 버튼=${(await measure(page)).settingsButton}`);
      await context.close();
    }

    {
      const { page, context } = await openHomePage(browser, port, { width: 1280, height: 800 });
      await shot(page, 'home-light-1280x800.png');
      await context.close();
    }
  } finally {
    await browser.close();
  }
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
      if (process.argv.includes('--home')) {
        await captureHome(pw, port);
        return;
      }
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
