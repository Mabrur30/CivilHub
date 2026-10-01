/**
 * Parses a query string so every value is a single string: a repeated key
 * (?q=a&q=b) keeps its first value instead of becoming an array, which
 * handlers would crash on when they call .trim().
 */
export const parseQueryString = (query: string): Record<string, string> => {
  const parsed: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(query)) {
    if (!(key in parsed)) parsed[key] = value;
  }
  return parsed;
};
