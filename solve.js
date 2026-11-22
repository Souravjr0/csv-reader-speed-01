// Fast drop-in for csv-reader 1.0.0 (make.fun).
// Original work, written for csv-reader-speed-01-run-20261121.
// Strategy: the reference reads one character at a time and builds every
// field with `value += c`. This version instead lets V8's native string
// primitives do the scanning:
//   * a record with no quote and no stray CR is split in one native
//     `String.split(',')` over a slice of the line;
//   * an unquoted field is found with three native `indexOf` calls
//     (comma / LF / CR) instead of a per-character loop;
//   * a quoted field is found with native `indexOf('"')`, skipping
//     doubled quotes, and is a single slice when it holds no doubled
//     quote and no line break inside.
// All broken-row behaviour (BOM, stray CR, unterminated quote,
// quote junk, short/long rows, blank lines, line counting) follows the
// reference exactly; see the comments at each branch.

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  // --- unquoted field, starting at pos, with `initial` already in the value.
  // Returns { value, ended } where ended is 0 = comma, 1 = line break, 2 = end.
  // `added` is returned too: characters kept by this call (not `initial`).
  // Stray-CR errors are pushed as they are met, before any quote_junk
  // error the caller pushes afterwards, matching the reference order.
  function readUnquoted(initial) {
    let value = initial;
    let added = 0;
    for (;;) {
      if (nextNl < pos) { nextNl = text.indexOf('\n', pos); if (nextNl === -1) nextNl = n; }
      const iComma = text.indexOf(',', pos);
      let end = n;
      let kind = 2;
      if (iComma !== -1 && iComma < nextNl) { end = iComma; kind = 0; }
      else if (nextNl < n) { end = nextNl; kind = 1; }
      // A CR before `end` can only be a stray CR (a CRLF would be the
      // line break itself, i.e. end is the LF and the CR is at end-1).
      // Check it on the short slice instead of a third scan of the text.
      let seg = end > pos ? text.slice(pos, end) : '';
      const iCr = seg.indexOf('\r');
      if (iCr !== -1) {
        // A trailing CR before a LF is the CR of a CRLF ending, not stray.
        const crlf = kind === 1 && seg.charCodeAt(seg.length - 1) === 13;
        if (crlf) seg = seg.slice(0, -1);
        // Stray CR(s) inside the field: drop each, error each.
        let start = 0;
        for (let j = 0; j <= seg.length; j++) {
          if (j === seg.length || seg.charCodeAt(j) === 13) {
            if (j > start) { value += seg.slice(start, j); added += j - start; }
            if (j < seg.length) errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            start = j + 1;
          }
        }
        if (kind === 0) { pos = end + 1; return { value, ended: 0, added }; }
        if (kind === 1) { pos = end + 1; line += 1; return { value, ended: 1, added }; }
        pos = n;
        return { value, ended: 2, added };
      }
      if (value === '') { value = seg; added = seg.length; }
      else if (seg.length > 0) { value += seg; added += seg.length; }
      if (kind === 0) { pos = end + 1; return { value, ended: 0, added }; }
      if (kind === 1) { pos = end + 1; line += 1; return { value, ended: 1, added }; }
      pos = n;
      return { value, ended: 2, added };
    }
  }

  // recordLine / recordRow are set by the outer loop before each record;
  // the helpers above read them for error objects. They are declared here
  // (hoisted `let` in this scope) so the closures above see the same cells.
  let recordLine = 1;
  let recordRow = null;
  // First LF at or after the current record's start, or n. Reused by
  // readUnquoted: an unquoted field that ends at a comma ends before
  // this LF, so no per-field LF scan is needed. Recomputed lazily when
  // stale (a quoted field consumed the LF it pointed at).
  let nextNl = -1;

  // --- quoted field whose opening quote is at pos.
  // Returns { value, ended } with the same `ended` codes as readUnquoted.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let cur = pos + 1;
    let hasDoubled = false;
    let close = -1;
    for (;;) {
      const q = text.indexOf('"', cur);
      if (q === -1) break;
      if (q + 1 < n && text.charCodeAt(q + 1) === 34) {
        hasDoubled = true;
        cur = q + 2;
        continue;
      }
      close = q;
      break;
    }
    if (close === -1) {
      // Never closes: the quote is a literal, the text after it is read
      // again as unquoted, with the line rolled back to the opening quote.
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      pos = open + 1;
      return readUnquoted('"');
    }
    // The quoted content, before un-doubling / CR normalisation.
    let value = text.slice(open + 1, close);
    // Count and normalise line breaks inside quotes: each CRLF and each
    // lone CR inside is one LF, and the line advances by that count.
    // nextNl is the first LF at or after this record's start (recomputed
    // if stale): if it lies before the closing quote, a LF is inside.
    if (nextNl < open) { nextNl = text.indexOf('\n', open); if (nextNl === -1) nextNl = n; }
    const iNl = nextNl < close ? nextNl : -1;
    const iCr = value.indexOf('\r');
    if (iNl !== -1 || iCr !== -1) {
      let breaks = 0;
      let idx = -1;
      while ((idx = value.indexOf('\n', idx + 1)) !== -1) breaks += 1;
      idx = -1;
      while ((idx = value.indexOf('\r', idx + 1)) !== -1) {
        if (value.charCodeAt(idx + 1) !== 10) breaks += 1;
      }
      line += breaks;
      if (iCr !== -1) value = value.replace(/\r\n?/g, '\n');
    }
    if (hasDoubled) value = value.replaceAll('""', '"');
    pos = close + 1;
    if (pos >= n) return { value, ended: 2 };
    const c = text.charCodeAt(pos);
    if (c === 44) { pos += 1; return { value, ended: 0 }; }
    if (c === 10) { pos += 1; line += 1; return { value, ended: 1 }; }
    if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
      pos += 2; line += 1; return { value, ended: 1 };
    }
    // Junk after the closing quote, appended as it stands.
    const junk = readUnquoted(value);
    if (junk.added > 0) {
      errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    }
    return junk;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos += 1; line += 1; }
      else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    nextNl = text.indexOf('\n', pos);
    if (nextNl === -1) nextNl = n;

    // ---- fast path: this record's first line holds no quote and no
    // stray CR, so the whole record is one native split.
    const lineEnd0 = text.indexOf('\n', pos);
    const lineEnd = lineEnd0 === -1 ? n : lineEnd0;
    const q0 = text.indexOf('"', pos);
    let fields = null;
    let fast = false;
    if (q0 === -1 || q0 >= lineEnd) {
      const r0 = text.indexOf('\r', pos);
      if (r0 === -1 || r0 >= lineEnd) {
        fields = text.slice(pos, lineEnd).split(',');
        fast = true;
      } else if (r0 === lineEnd - 1 && lineEnd < n) {
        // Sole CR is the CR of a CRLF line ending.
        fields = text.slice(pos, lineEnd - 1).split(',');
        fast = true;
      }
    }
    if (fast) {
      if (lineEnd < n) { pos = lineEnd + 1; line += 1; } else { pos = n; }
      // A fast-path record cannot be the single-empty-unquoted case:
      // empty lines were skipped above, so the slice is non-empty.
      if (width < 0) width = fields.length;
      if (header && columns === null) { columns = fields; continue; }
      if (fields.length < width) {
        errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
        while (fields.length < width) fields.push('');
      } else if (fields.length > width) {
        errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
      }
      rows.push(fields);
      continue;
    }

    // ---- slow path: per-field parsing (records with quotes / stray CRs).
    fields = [];
    let field;
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === 0);

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) { columns = fields; continue; }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
