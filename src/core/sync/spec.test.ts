import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSyncRequest, parseSyncResponse } from './protocol';

/** The examples of `docs/specs/sync-protocol.md` are tests: what the specification shows is what the code takes. */
const spec = readFileSync(join(__dirname, '../../../docs/specs/sync-protocol.md'), 'utf8');

function example(name: string): string {
  const match = new RegExp(`<!-- example: ${name} -->\\s*\`\`\`json\\n([\\s\\S]*?)\`\`\``).exec(
    spec,
  );
  if (!match?.[1]) throw new Error(`no example ${name}`);
  // The examples abbreviate sealed values with "…"; they are replaced by text that is base64url, since only the structure is in question.
  return match[1].replace(/"([A-Za-z0-9_-]*)…"/g, '"AAAA"');
}

describe('the specification’s examples', () => {
  it('the request is one the server takes', () => {
    const parsed = parseSyncRequest(example('request'));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.mutations.map((m) => m.op)).toEqual(['put', 'delete']);
      expect(parsed.request.mutations[0]?.baseVersion).toBe(0);
    }
  });

  it('the answer is one the device takes', () => {
    const answer = parseSyncResponse(JSON.parse(example('response')));
    expect(answer?.applied[0]).toMatchObject({ seq: 42, version: 1 });
    expect(answer?.refused[0]?.code).toBe('stale');
    expect(answer?.refused[0]?.current?.version).toBe(4);
  });
});
