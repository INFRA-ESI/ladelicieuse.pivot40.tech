import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// En développement, tsx accepte un import relatif sans extension. Une fois compilé, Node (ESM) le refuse :
// le serveur plante au démarrage avec ERR_MODULE_NOT_FOUND. Aucun autre contrôle (typage, tests, build) ne le voit,
// parce que tsc résout les modules à la manière d'un bundler. Ce test est le garde-fou.

const BACKEND = join(__dirname, '..');
const IGNORED = new Set(['node_modules', 'dist', 'tests', 'public', 'logs']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    if (IGNORED.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.d.ts') && name !== 'vitest.config.ts' ? [path] : [];
  });
}

const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;

describe('imports du backend, valables une fois compilé', () => {
  it('tout import relatif porte une extension (.js ou .json)', () => {
    const fautifs: string[] = [];
    for (const file of sourceFiles(BACKEND)) {
      const code = readFileSync(file, 'utf8');
      for (const match of code.matchAll(RELATIVE_IMPORT)) {
        if (!/\.(js|json)$/.test(match[1])) fautifs.push(`${relative(BACKEND, file)} : ${match[1]}`);
      }
    }
    expect(fautifs).toEqual([]);
  });
});
