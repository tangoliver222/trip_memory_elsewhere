import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeDocumentAiOcr } from '../../src/capabilities/ocr-normalizer.js';

const golden = JSON.parse(await readFile(
  new URL('../fixtures/document-ai/one-page-response.json', import.meta.url),
  'utf8',
));
const CONTEXT = Object.freeze({
  resultId: 'capresult_12345678',
  fragmentId: 'fragment_12345678',
  executionId: 'execution_12345678',
  observedAt: '2026-07-17T13:30:00.000Z',
});

test('normalizes one page in provider order and proposes only safe OCR facts', () => {
  const result = normalizeDocumentAiOcr({ document: golden, ...CONTEXT });

  assert.equal(result.outcome, 'completed');
  assert.equal(result.normalized.text, 'COMMON GROUNDS\nAmericano 90.00\n');
  assert.deepEqual(result.normalized.languageCodes, ['en', 'th']);
  assert.equal(result.normalized.pageCount, 1);
  assert.deepEqual(result.normalized.pages[0].lines.map(({ text }) => text), [
    'COMMON GROUNDS\n',
    'Americano 90.00\n',
  ]);
  assert.deepEqual(result.normalized.pages[0].tokens.map(({ text }) => text), [
    'COMMON', 'GROUNDS',
  ]);
  assert.equal(Object.hasOwn(result.suggestedFacts, 'merchantName'), false);
  assert.equal(Object.hasOwn(result.suggestedFacts, 'totalAmount'), false);
  assert.deepEqual(Object.keys(result.suggestedFacts).sort(), [
    'ocrLanguageCodes', 'ocrPageCount', 'ocrQualitySummary', 'ocrResultRef',
  ]);
  assert.deepEqual(result.suggestedFacts.ocrResultRef.value, {
    type: 'capabilityResult', id: CONTEXT.resultId,
  });
  assert.equal(result.suggestedFacts.ocrPageCount.sourceType, 'ocr');
  assert.equal(Object.isFrozen(result), true);
});

test('uses provider page order when Document AI returns the protobuf default page number', () => {
  const document = structuredClone(golden);
  document.pages[0].pageNumber = 0;

  const result = normalizeDocumentAiOcr({ document, ...CONTEXT });

  assert.equal(result.normalized.pages[0].pageNumber, 1);
});

test('concatenates valid multi-segment anchors and rejects malformed or out-of-range offsets', () => {
  const document = structuredClone(golden);
  document.pages[0].tokens[0].layout.textAnchor.textSegments = [
    { startIndex: '0', endIndex: '6' },
    { startIndex: '15', endIndex: '24' },
  ];
  assert.equal(
    normalizeDocumentAiOcr({ document, ...CONTEXT }).normalized.pages[0].tokens[0].text,
    'COMMONAmericano',
  );

  for (const segment of [
    { startIndex: '-1', endIndex: '2' },
    { startIndex: '4', endIndex: '2' },
    { startIndex: '0', endIndex: '999' },
    { startIndex: 'x', endIndex: '2' },
  ]) {
    const malformed = structuredClone(golden);
    malformed.pages[0].lines[0].layout.textAnchor.textSegments = [segment];
    assert.throws(() => normalizeDocumentAiOcr({ document: malformed, ...CONTEXT }), TypeError);
  }
});

test('empty OCR remains persisted evidence but requests controlled escalation', () => {
  const empty = normalizeDocumentAiOcr({
    document: { text: '', pages: [] },
    ...CONTEXT,
  });
  assert.equal(empty.outcome, 'insufficient_input');
  assert.equal(empty.normalized.text, '');
  assert.deepEqual(empty.normalized.languageCodes, []);
  assert.deepEqual(empty.suggestedFacts.ocrQualitySummary.value.defectCodes, [
    'ocr-text-empty',
  ]);
});

test('normalizer rejects extra context and never mutates the provider response', () => {
  const before = structuredClone(golden);
  assert.throws(() => normalizeDocumentAiOcr({
    document: golden,
    ...CONTEXT,
    ownerId: 'forged_owner',
  }), TypeError);
  normalizeDocumentAiOcr({ document: golden, ...CONTEXT });
  assert.deepEqual(golden, before);
});
