import path from 'node:path';

const fontsDir = path.resolve(__dirname, '../../assets/fonts');
const scripts: Array<[RegExp, string]> = [
  [/\p{Script=Devanagari}/u, 'Devanagari'], [/\p{Script=Bengali}/u, 'Bengali'],
  [/\p{Script=Gujarati}/u, 'Gujarati'], [/\p{Script=Gurmukhi}/u, 'Gurmukhi'],
  [/\p{Script=Oriya}/u, 'Oriya'], [/\p{Script=Tamil}/u, 'Tamil'],
  [/\p{Script=Telugu}/u, 'Telugu'], [/\p{Script=Kannada}/u, 'Kannada'],
  [/\p{Script=Malayalam}/u, 'Malayalam']
];
const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** Keep combining characters together so fontkit shapes each Indic run as a unit. */
export function printField(doc: PDFKit.PDFDocument, text: string, latinFont = 'Helvetica') {
  if (!scripts.some(([pattern]) => pattern.test(text))) {
    doc.font(latinFont).text(text);
    return;
  }
  const runs: Array<{ font: string; value: string }> = [];
  for (const { segment } of graphemes.segment(text)) {
    const script = scripts.find(([pattern]) => pattern.test(segment));
    const font = script ? path.join(fontsDir, 'NotoSans' + script[1] + '-Regular.ttf') : latinFont;
    const last = runs[runs.length - 1];
    if (last?.font === font) last.value += segment;
    else runs.push({ font, value: segment });
  }
  // Preserve logical Unicode order across shaped glyph clusters for PDF readers.
  doc.markContent('Span', { actual: text });
  for (const [i, run] of runs.entries()) {
    doc.font(run.font).text(run.value, { continued: i !== runs.length - 1 });
  }
  doc.endMarkedContent().font(latinFont);
}
