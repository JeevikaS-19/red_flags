// Pure functions that apply the scanner's suggested changes to a skill's text.
// No DOM here, so they can be tested on their own (tests/js/patch.test.mjs).

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Find a snippet in the text. Tries an exact match first, then a match that ignores
 * differences in whitespace, since the model may re-wrap lines when it quotes.
 * @returns {{start: number, end: number} | null}
 */
export function locate(text, snippet) {
  const wanted = snippet.trim();
  if (!wanted) return null;

  const exact = text.indexOf(wanted);
  if (exact !== -1) return { start: exact, end: exact + wanted.length };

  const pattern = wanted.split(/\s+/).map(escapeRegex).join("\\s+");
  const match = new RegExp(pattern).exec(text);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

/**
 * Apply changes one after another.
 * @param {string} text the skill
 * @param {{snippet: string, action: string, replacement?: string}[]} changes
 * @returns {{text: string, applied: number[], missed: number[]}} indexes into `changes`
 */
export function applyChanges(text, changes) {
  let result = text;
  const applied = [];
  const missed = [];

  changes.forEach((change, index) => {
    const found = locate(result, change.snippet);
    if (!found) {
      missed.push(index);
      return;
    }
    const replacement = change.action === "replace" ? change.replacement || "" : "";
    result = result.slice(0, found.start) + replacement + result.slice(found.end);
    applied.push(index);
  });

  // Removing a block can leave a run of blank lines behind.
  return { text: result.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+$/gm, ""), applied, missed };
}
