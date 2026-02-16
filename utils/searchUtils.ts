/**
 * Find all occurrences of a search term in text
 */
export function findSearchResults(
  text: string,
  searchTerm: string,
  caseSensitive: boolean = false
): Array<{ index: number; length: number }> {
  if (!searchTerm) return [];

  const results: Array<{ index: number; length: number }> = [];
  const searchContent = caseSensitive ? text : text.toLowerCase();
  const search = caseSensitive ? searchTerm : searchTerm.toLowerCase();

  let index = 0;
  while ((index = searchContent.indexOf(search, index)) !== -1) {
    results.push({ index, length: searchTerm.length });
    index += searchTerm.length;
  }

  return results;
}

/**
 * Get cursor position from text index (line, column)
 */
export function getLineAndColFromIndex(
  text: string,
  index: number
): { line: number; col: number } {
  const before = text.substring(0, index);
  const lines = before.split('\n');
  return {
    line: lines.length,
    col: lines[lines.length - 1].length + 1
  };
}

/**
 * Get text index from line and column
 */
export function getIndexFromLineAndCol(
  text: string,
  line: number,
  col: number
): number {
  const lines = text.split('\n');
  let index = 0;

  for (let i = 0; i < line - 1; i++) {
    index += lines[i].length + 1; // +1 for newline
  }

  return index + col - 1;
}
