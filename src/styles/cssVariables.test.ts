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

interface UndefinedVarOccurrence {
  file: string;
  variable: string;
  line: number;
}

function findUndefinedVariables(
  sourceFiles: string[],
  definedVars: Set<string>
): UndefinedVarOccurrence[] {
  const occurrences: UndefinedVarOccurrence[] = [];
  const varRegex = /var\((--[a-z0-9-]+)/g;

  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const lineText = lines[lineIndex];
      let match: RegExpExecArray | null;
      varRegex.lastIndex = 0;

      while ((match = varRegex.exec(lineText)) !== null) {
        const varName = match[1];
        if (!definedVars.has(varName) && !ALLOWED_EXCEPTIONS.has(varName)) {
          occurrences.push({
            file: path.relative(process.cwd(), file),
            variable: varName,
            line: lineIndex + 1,
          });
        }
      }
    }
  }

  return occurrences;
}

describe('CSS Variable Design Tokens (D2)', () => {
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
});
