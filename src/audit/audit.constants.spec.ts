import { EXCLUDE_PREFIXES } from './audit.constants';

describe('audit exclusions', () => {
  it.each(['/health', '/health/live', '/health/ready'])(
    'excludes %s from HTTP audit persistence',
    (path) => {
      expect(EXCLUDE_PREFIXES.some((prefix) => path.startsWith(prefix))).toBe(
        true,
      );
    },
  );
});
