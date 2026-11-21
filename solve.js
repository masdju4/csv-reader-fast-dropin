// Fast drop-in for csv-reader 1.0.0: run(input) returns exactly what csv-reader 1.0.0's
// readCsv returns for every input (see the kit's baseline vendor/csv-reader/index.js for the
// reference semantics this module replicates).
//
// Strategy: same single left-to-right pass and the same broken-row policy, but fields are
// taken as whole slices (text.slice) instead of being built a character at a time, quoted
// sections jump quote-to-quote with String.prototype.indexOf, and line counting walks a
// section only where the record's errors need it. Pure: nothing is kept from one call to
// the next.

const COMMA = 1;
const LINE_BREAK = 2;
const END = 3;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;

  // A record of plain unquoted fields (no quote, no CR anywhere), matched in one native
  // pass. Sticky at the current position; fresh per call so nothing is kept between calls.
  const simpleRe = /[^,"\r\n]*(?:,[^,"\r\n]*)*/y;

  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Counts the line increments of text[from,to): every LF, plus one for each CR (a CRLF
  // pair counts once — the CR branch consumes the LF that follows it). Used on quoted
  // sections, where every CR and LF counts; outside quotes only the non-stray CRs get
  // here, and those are exactly the ones inside a quoted section.
  function countLines(from, to) {
    let inc = 0;
    for (let j = from; j < to; j++) {
      const c = text.charCodeAt(j);
      if (c === 10) inc++;
      else if (c === 13) {
        inc++;
        if (text.charCodeAt(j + 1) === 10) j++;
      }
    }
    return inc;
  }

  // Reads an unquoted field from pos (or the unquoted re-read of an unterminated quote,
  // whose value starts with the literal `"` carried in initParts). Delimiters: `,` (the
  // record goes on), LF and CRLF (the record ends). A stray CR is dropped (stray_cr). The
  // fast path slices the whole field in one piece; a dropped CR splits it into segments.
  // Pushes the field's value onto fields and returns how the field ended.
  function readUnquoted(fields, initParts) {
    const fieldStart = pos;
    let parts = initParts;
    let added = 0;
    let ended = END;
    let valueEnd = pos;
    for (;;) {
      let i = pos;
      let d = 0;
      while (i < len) {
        d = text.charCodeAt(i);
        if (d === 44 || d === 10 || d === 13) break;
        i++;
      }
      if (i > pos) {
        if (parts !== null) {
          parts.push(text.slice(pos, i));
          added += i - pos;
        }
        pos = i;
      }
      if (pos >= len) {
        valueEnd = pos;
        ended = END;
        break;
      }
      if (d === 44) {
        valueEnd = pos;
        pos++;
        ended = COMMA;
        break;
      }
      if (d === 10) {
        valueEnd = pos;
        pos++;
        line++;
        ended = LINE_BREAK;
        break;
      }
      // d === 13
      if (text.charCodeAt(pos + 1) === 10) {
        valueEnd = pos;
        pos += 2;
        line++;
        ended = LINE_BREAK;
        break;
      }
      // A stray CR is dropped (stray_cr); the field goes on.
      error('stray_cr');
      if (parts === null) parts = [text.slice(fieldStart, pos)];
      pos++;
    }
    let value;
    if (parts !== null) {
      value = parts.join('');
    } else {
      added = valueEnd - fieldStart;
      value = valueEnd === fieldStart ? '' : text.slice(fieldStart, valueEnd);
    }
    fields.push(value);
    return { ended, added };
  }

  // Pushes the quoted section text[from,to) onto parts as the value's next piece: every
  // LF and every CR (CRLF or lone) inside it is one line, and each CR becomes an LF.
  function pushSegment(parts, from, to) {
    let hasCR = false;
    for (let j = from; j < to; j++) {
      if (text.charCodeAt(j) === 13) {
        hasCR = true;
        break;
      }
    }
    if (!hasCR) {
      line += countLines(from, to);
      parts.push(text.slice(from, to));
    } else {
      let v = '';
      for (let j = from; j < to; j++) {
        const c = text.charCodeAt(j);
        if (c === 13) {
          v += '\n';
          line++;
          if (text.charCodeAt(j + 1) === 10) j++;
        } else {
          if (c === 10) line++;
          v += text[j];
        }
      }
      parts.push(v);
    }
  }

  // Reads a quoted field whose opening quote is at pos. Jumps quote to quote with indexOf;
  // a plain section (no doubled quotes, no CR) is taken as one slice, a section with doubled
  // quotes or CRs is rebuilt segment by segment ("" is one quote, each CRLF or lone CR is
  // one LF). What follows the closing quote, up to the next comma or line break, is appended
  // as it stands (quote_junk, when junk characters were kept). A quote that never closes is
  // a literal character and the text after it is read again as unquoted (unterminated_quote).
  // Pushes the field's value onto fields and returns how the field ended.
  function readQuoted(fields) {
    const open = pos;
    const openLine = line;
    let i = open + 1;
    let parts = null;
    let q = -1;
    for (;;) {
      q = text.indexOf('"', i);
      if (q === -1) {
        // The quote never closes: rewind to just after the opening quote and read the rest
        // as an unquoted field whose value starts with the literal quote character.
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        return readUnquoted(fields, ['"']);
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one literal quote inside the value.
        if (parts === null) parts = [];
        if (q > i) pushSegment(parts, i, q);
        parts.push('"');
        i = q + 2;
        continue;
      }
      break; // the closing quote is at q
    }
    const closeQ = q;
    let value;
    if (parts === null) {
      // No doubled quotes: the value is the raw section, normalized only when it holds a CR.
      let hasCR = false;
      let inc = 0;
      for (let j = open + 1; j < closeQ; j++) {
        const c = text.charCodeAt(j);
        if (c === 10) inc++;
        else if (c === 13) {
          inc++;
          hasCR = true;
          if (text.charCodeAt(j + 1) === 10) j++;
        }
      }
      line += inc;
      if (closeQ === open + 1) value = '';
      else {
        const raw = text.slice(open + 1, closeQ);
        value = hasCR ? raw.replace(/\r\n?/g, '\n') : raw;
      }
    } else {
      if (closeQ > i) pushSegment(parts, i, closeQ);
      value = parts.join('');
    }
    pos = closeQ + 1;
    // How the field ends after the closing quote.
    if (pos >= len) {
      fields.push(value);
      return { ended: END, added: 0 };
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos++;
      fields.push(value);
      return { ended: COMMA, added: 0 };
    }
    if (c === 10) {
      pos++;
      line++;
      fields.push(value);
      return { ended: LINE_BREAK, added: 0 };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line++;
      fields.push(value);
      return { ended: LINE_BREAK, added: 0 };
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line
    // break; kept characters beyond the quote make the field quote_junk.
    const junk = readUnquoted(fields, [value]);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos++;
        line++;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
      } else break;
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    let fields = null;
    let quoted = false;

    // Fast path: a record of plain unquoted fields only (no quote, no CR anywhere) is
    // matched in one native pass and split natively; the reference reads it a character
    // at a time. Anything with a quote or a stray CR falls through to the field loop.
    simpleRe.lastIndex = pos;
    const simple = simpleRe.exec(text);
    if (simple !== null && simple[0].length > 0) {
      const after = pos + simple[0].length;
      const c = after < len ? text.charCodeAt(after) : -1;
      if (c === -1 || c === 10 || (c === 13 && text.charCodeAt(after + 1) === 10)) {
        fields = simple[0].split(',');
        pos = after;
        if (c === 10) {
          pos++;
          line++;
        } else if (c === 13) {
          pos += 2;
          line++;
        }
      }
    }

    if (fields === null) {
      const collected = [];
      let field;
      do {
        quoted = text.charCodeAt(pos) === 34;
        field = quoted ? readQuoted(collected) : readUnquoted(collected, null);
      } while (field.ended === COMMA);
      fields = collected;
    }

    // A line that held only stray CRs is left with no characters: no record (its stray_cr
    // errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
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
