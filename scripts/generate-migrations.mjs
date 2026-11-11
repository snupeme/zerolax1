// Generated migration bundle — do not edit by hand.
// Source of truth: supabase/migrations/*.sql
// Regenerate with: npm run migrations:generate

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');
const outFile = join(root, 'packages', 'db', 'src', 'migrations.generated.ts');

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const entries = files.map((file) => {
  const sql = readFileSync(join(migrationsDir, file), 'utf8');
  return `  {\n    name: ${JSON.stringify(file)},\n    sql: ${JSON.stringify(sql)},\n  },`;
});

const output = `// AUTO-GENERATED from supabase/migrations — do not edit manually.
// Run \`npm run migrations:generate\` after changing SQL migrations.
export interface Migration {
  name: string;
  sql: string;
}

export const migrations: Migration[] = [
${entries.join('\n')}
];
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, output, 'utf8');
console.log(`Generated ${outFile} (${files.length} migrations)`);
