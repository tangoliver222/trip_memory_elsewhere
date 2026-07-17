import { IdSchema, IsoDateTimeSchema } from '../domain/index.js';

const INPUT_KEYS = ['document', 'executionId', 'fragmentId', 'observedAt', 'resultId'];
const COLLECTIONS = ['blocks', 'paragraphs', 'lines', 'tokens'];

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function strictInput(input) {
  if (!input
    || typeof input !== 'object'
    || Array.isArray(input)
    || Object.keys(input).sort().join('\0') !== INPUT_KEYS.join('\0')
    || !input.document
    || typeof input.document !== 'object'
    || Array.isArray(input.document)
    || typeof input.document.text !== 'string'
    || !Array.isArray(input.document.pages)
    || !IdSchema.safeParse(input.resultId).success
    || !IdSchema.safeParse(input.fragmentId).success
    || !IdSchema.safeParse(input.executionId).success
    || !IsoDateTimeSchema.safeParse(input.observedAt).success) {
    throw new TypeError('Document AI OCR normalization input is invalid');
  }
  return input;
}

function offset(value, fallback = null) {
  const normalized = value === undefined && fallback !== null ? fallback : Number(value);
  return Number.isSafeInteger(normalized) ? normalized : null;
}

function anchorText(text, anchor) {
  const segments = anchor?.textSegments;
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new TypeError('OCR text anchor is invalid');
  }
  return segments.map((segment) => {
    const start = offset(segment?.startIndex, 0);
    const end = offset(segment?.endIndex);
    if (start === null || end === null || start < 0 || end < start || end > text.length) {
      throw new TypeError('OCR text anchor is invalid');
    }
    return text.slice(start, end);
  }).join('');
}

function confidence(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function normalizeLayout(text, layout) {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) {
    throw new TypeError('OCR layout is invalid');
  }
  return {
    text: anchorText(text, layout.textAnchor),
    confidence: confidence(layout.confidence),
  };
}

function defectCode(type) {
  if (typeof type !== 'string') return null;
  const tail = type.split('/').at(-1)?.replace(/^defect_/, '').replaceAll('_', '-');
  return tail && /^[a-z0-9][a-z0-9-]{1,63}$/.test(tail) ? tail : null;
}

function normalizePage(text, page, index) {
  if (!page || typeof page !== 'object' || Array.isArray(page)) {
    throw new TypeError('OCR page is invalid');
  }
  const pageNumber = page.pageNumber ?? index + 1;
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) {
    throw new TypeError('OCR page number is invalid');
  }
  const normalized = {
    pageNumber,
    dimension: {
      width: page.dimension?.width ?? null,
      height: page.dimension?.height ?? null,
      unit: page.dimension?.unit ?? null,
    },
    layout: normalizeLayout(text, page.layout),
  };
  for (const collection of COLLECTIONS) {
    if (!Array.isArray(page[collection])) throw new TypeError('OCR page collection is invalid');
    normalized[collection] = page[collection].map((item) => normalizeLayout(text, item?.layout));
  }
  normalized.detectedLanguages = (page.detectedLanguages ?? [])
    .filter(({ languageCode }) => typeof languageCode === 'string' && languageCode.length > 0)
    .map(({ languageCode, confidence: value }) => ({
      languageCode,
      confidence: confidence(value),
    }))
    .sort((left, right) => left.languageCode.localeCompare(right.languageCode));
  normalized.imageQuality = {
    score: confidence(page.imageQualityScores?.qualityScore),
    defects: (page.imageQualityScores?.detectedDefects ?? [])
      .map((defect) => ({
        code: defectCode(defect.type),
        confidence: confidence(defect.confidence),
      }))
      .filter(({ code }) => code !== null)
      .sort((left, right) => left.code.localeCompare(right.code)),
  };
  return normalized;
}

function average(values) {
  const present = values.filter((value) => value !== null);
  if (present.length === 0) return null;
  return present.reduce((total, value) => total + value, 0) / present.length;
}

function provenance(context, value, score) {
  return {
    value,
    sourceType: 'ocr',
    sourceRefs: [
      { type: 'capabilityResult', id: context.resultId },
      { type: 'fragment', id: context.fragmentId },
    ],
    processor: {
      name: 'document-ai-enterprise-ocr',
      version: 'v1',
      modelAlias: null,
      promptVersion: null,
    },
    confidence: score,
    status: 'suggested',
    observedAt: context.observedAt,
  };
}

export function normalizeDocumentAiOcr(input) {
  const context = strictInput(input);
  const text = context.document.text;
  const pages = context.document.pages.map((page, index) => normalizePage(text, page, index));
  const languageCodes = [...new Set(pages.flatMap(({ detectedLanguages }) => (
    detectedLanguages.map(({ languageCode }) => languageCode)
  )))].sort();
  const layoutConfidences = pages.flatMap((page) => [
    page.layout.confidence,
    ...COLLECTIONS.flatMap((collection) => (
      page[collection].map(({ confidence: value }) => value)
    )),
  ]);
  const averageConfidence = average(layoutConfidences);
  const defectCodes = [...new Set(pages.flatMap(({ imageQuality }) => (
    imageQuality.defects.map(({ code }) => code)
  )))].sort();
  if (text.trim().length === 0) defectCodes.push('ocr-text-empty');
  defectCodes.sort();
  const qualitySummary = { averageConfidence, defectCodes };
  const normalized = {
    schemaVersion: 1,
    executionId: context.executionId,
    fragmentId: context.fragmentId,
    text,
    pageCount: pages.length,
    languageCodes,
    qualitySummary,
    pages,
  };
  const resultRef = { type: 'capabilityResult', id: context.resultId };
  const score = averageConfidence ?? 0;
  return deepFreeze({
    outcome: text.trim().length === 0 ? 'insufficient_input' : 'completed',
    normalized,
    suggestedFacts: {
      ocrLanguageCodes: provenance(context, languageCodes, score),
      ocrPageCount: provenance(context, pages.length, 1),
      ocrQualitySummary: provenance(context, qualitySummary, score),
      ocrResultRef: provenance(context, resultRef, 1),
    },
  });
}
