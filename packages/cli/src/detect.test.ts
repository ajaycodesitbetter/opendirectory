import { describe, expect, test } from 'vitest';
import { isValidAgent } from './detect';

describe('isValidAgent', () => {
  test.each(['constructor', 'toString'])('rejects inherited property name %s', target => {
    expect(isValidAgent(target)).toBe(false);
  });

  test('accepts canonical target names', () => {
    expect(isValidAgent('codex')).toBe(true);
  });
});
