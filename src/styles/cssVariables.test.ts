/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 런타임 또는 컴포넌트 인라인 스타일로 주입되는 동적 CSS 변수 허용 목록.
 * 일반 테마/디자인 토큰은 반드시 src/index.css에 정의되어야 함.
 */
const ALLOWED_EXCEPTIONS = new Set<string>([
  // LiquidGauge 컴포넌트(LiquidGauge.tsx:31)가 런타임에 인라인 style로 주입하는 동적 크기 변수
  '--gauge-size',
]);

function getDefinedCssVariables(indexPath: string): Set<string> {
  const content = fs.readFileSync(indexPath, 'utf-8');
  const defined = new Set<string>();
  const regex = /^\s*(--[a-z0-9-]+):/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    defined.add(match[1]);
  }
  return defined;
}

function getAllSourceFiles(dir: string, fileList: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getAllSourceFiles(fullPath, fileList);
    } else if (
      (entry.name.endsWith('.ts') ||
        entry.name.endsWith('.tsx') ||
        entry.name.endsWith('.css')) &&
      !entry.name.includes('.test.')
    ) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

export interface UndefinedVarOccurrence {
  file: string;
  variable: string;
  line: number;
}

export function findUndefinedVariablesInContent(
  content: string,
  filePath: string,
  definedVars: Set<string>
): UndefinedVarOccurrence[] {
  const occurrences: UndefinedVarOccurrence[] = [];
  const varRegex = /var\((--[a-z0-9-]+)/g;
  const lines = content.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineText = lines[lineIndex];
    let match: RegExpExecArray | null;
    varRegex.lastIndex = 0;

    while ((match = varRegex.exec(lineText)) !== null) {
      const varName = match[1];
      if (!definedVars.has(varName) && !ALLOWED_EXCEPTIONS.has(varName)) {
        occurrences.push({
          file: filePath,
          variable: varName,
          line: lineIndex + 1,
        });
      }
    }
  }

  return occurrences;
}

function findUndefinedVariables(
  sourceFiles: string[],
  definedVars: Set<string>
): UndefinedVarOccurrence[] {
  const occurrences: UndefinedVarOccurrence[] = [];

  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const relativePath = path.relative(process.cwd(), file);
    occurrences.push(...findUndefinedVariablesInContent(content, relativePath, definedVars));
  }

  return occurrences;
}

export interface HexColorOccurrence {
  file: string;
  hex: string;
  line: number;
}

export function findHexColorViolationsInContent(
  content: string,
  filePath: string
): HexColorOccurrence[] {
  const occurrences: HexColorOccurrence[] = [];
  const hexRegex = /['"](#[0-9a-fA-F]{3,8})['"]/g;
  const lines = content.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineText = lines[lineIndex];
    let match: RegExpExecArray | null;
    hexRegex.lastIndex = 0;

    while ((match = hexRegex.exec(lineText)) !== null) {
      const hex = match[1];
      const matchIndex = match.index;
      const before = lineText.slice(0, matchIndex);

      if (/var\(\s*--[a-z0-9-]+\s*,\s*$/.test(before)) {
        continue;
      }

      if (/(?:fill|stroke)\s*=\s*$/.test(before) || /(?:fill|stroke)\s*:\s*$/.test(before)) {
        continue;
      }

      occurrences.push({
        file: filePath,
        hex,
        line: lineIndex + 1,
      });
    }
  }

  return occurrences;
}

describe('CSS Variable Design Tokens (D2 / V3-01)', () => {
  it('enforces all var(--...) references are defined in src/index.css', () => {
    const rootDir = process.cwd();
    const indexCssPath = path.join(rootDir, 'src', 'index.css');

    expect(fs.existsSync(indexCssPath)).toBe(true);
    const definedVars = getDefinedCssVariables(indexCssPath);

    expect(definedVars.size).toBeGreaterThan(0);

    const sourceFiles = getAllSourceFiles(path.join(rootDir, 'src'));
    const undefinedOccurrences = findUndefinedVariables(sourceFiles, definedVars);

    if (undefinedOccurrences.length > 0) {
      const formatted = undefinedOccurrences
        .map((o) => `  ${o.file}:${o.line} -> ${o.variable}`)
        .join('\n');
      expect.fail(
        `Found ${undefinedOccurrences.length} undefined CSS variable references:\n${formatted}`
      );
    }

    expect(undefinedOccurrences).toHaveLength(0);
  });

  it('fails and reports occurrences when undefined CSS variables are present', () => {
    const mockContent = `
      .card {
        background: var(--bg-card);
        color: var(--undefined-color);
        border: 1px solid var(--another-missing);
      }
    `;
    const definedVars = new Set<string>(['--bg-card']);
    const issues = findUndefinedVariablesInContent(mockContent, 'src/components/Sample.tsx', definedVars);

    expect(issues).toHaveLength(2);
    expect(issues[0]).toEqual({
      file: 'src/components/Sample.tsx',
      variable: '--undefined-color',
      line: 4,
    });
    expect(issues[1]).toEqual({
      file: 'src/components/Sample.tsx',
      variable: '--another-missing',
      line: 5,
    });
  });

  it('guarantees v3 color tokens (§6) are defined in src/index.css in both root and dark themes', () => {
    const rootDir = process.cwd();
    const indexCssPath = path.join(rootDir, 'src', 'index.css');
    const content = fs.readFileSync(indexCssPath, 'utf-8');

    const requiredV3Tokens = [
      '--brand-lavender',
      '--brand-lavender-tint',
      '--brand-lavender-text',
      '--brand-apricot',
      '--brand-apricot-tint',
      '--brand-apricot-text',
      '--sticker-bronze',
      '--sticker-silver',
      '--sticker-gold',
      '--sticker-stage-tint',
      '--player-surface',
      '--player-surface-full',
    ];

    const definedVars = getDefinedCssVariables(indexCssPath);
    for (const token of requiredV3Tokens) {
      expect(definedVars.has(token), `Token ${token} must be defined in src/index.css`).toBe(true);
    }

    // Verify dark mode block also has them
    const darkModeMatch = content.match(/\.app-shell\[data-theme=['"]dark['"]\]\s*\{([^}]+)\}/);
    expect(darkModeMatch, 'Dark mode block (.app-shell[data-theme="dark"]) must exist').toBeTruthy();
    const darkModeContent = darkModeMatch ? darkModeMatch[1] : '';

    for (const token of requiredV3Tokens) {
      const hasTokenInDark = new RegExp(`${token}\\s*:`).test(darkModeContent);
      expect(hasTokenInDark, `Token ${token} must also be defined in .app-shell[data-theme='dark']`).toBe(true);
    }
  });

  describe('Hex Color Literal Guard (G4)', () => {
    it('catches raw hex color literals in component styles but permits var() fallback and SVG attributes', () => {
      const mockViolation = `
        <div style={{ background: '#ff0000', color: var(--text-white, #ffffff) }}>
          <svg fill="#123456" stroke="#abcdef" />
        </div>
      `;
      const issues = findHexColorViolationsInContent(mockViolation, 'src/components/Test.tsx');
      expect(issues).toHaveLength(1);
      expect(issues[0]).toEqual({
        file: 'src/components/Test.tsx',
        hex: '#ff0000',
        line: 2,
      });
    });

    it('enforces that no new raw hex colors exist in src/components/**/*.tsx outside the allowlist', () => {
      const rootDir = process.cwd();
      const allowlistPath = path.join(rootDir, 'src', 'styles', 'hexColorAllowlist.json');
      expect(fs.existsSync(allowlistPath)).toBe(true);

      const allowlistArray: string[] = JSON.parse(fs.readFileSync(allowlistPath, 'utf-8'));
      const allowlist = new Set<string>(allowlistArray.map((entry) => entry.toLowerCase()));

      const componentFiles: string[] = [];
      const scanDir = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) {
            componentFiles.push(fullPath);
          }
        }
      };
      scanDir(path.join(rootDir, 'src', 'components'));

      const newViolations: HexColorOccurrence[] = [];
      for (const file of componentFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const relativePath = path.relative(rootDir, file).replace(/\\/g, '/');
        const violations = findHexColorViolationsInContent(content, relativePath);

        for (const v of violations) {
          const key = `${v.file}:${v.hex}`.toLowerCase();
          if (!allowlist.has(key)) {
            newViolations.push(v);
          }
        }
      }

      if (newViolations.length > 0) {
        const formatted = newViolations
          .map((v) => `  ${v.file}:${v.line} -> ${v.hex}`)
          .join('\n');
        expect.fail(
          `Found ${newViolations.length} new unapproved raw hex colors in components:\n${formatted}`
        );
      }

      expect(newViolations).toHaveLength(0);
    });
  });
});
