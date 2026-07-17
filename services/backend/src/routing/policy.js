import { parseFragment } from '../domain/fragment.js';

export const ROUTER_V1 = Object.freeze({ name: 'fragment-routing', version: 'v1' });
export const POLICY_V1 = Object.freeze({
  name: 'authoritative-routing-policy',
  version: 'v1',
});
export const COST_MODEL_V1 = Object.freeze({
  name: 'routing-admission-costs',
  version: 'v1',
});

const CAPABILITIES = Object.freeze(['ocr', 'places', 'embedding', 'gemini']);
const DOCUMENT_TYPES = new Set(['receipt', 'ticket', 'menu', 'screenshot']);
const GEMINI_ESCALATION_TYPES = new Set(['receipt', 'ticket', 'menu', 'screenshot']);
const SUPPORTING_RULES = Object.freeze({
  'exact-duplicate-supporting': 'exact-duplicate-reuse',
  'near-duplicate-supporting': 'near-duplicate-supporting',
  'burst-supporting': 'burst-supporting',
});
const GEMINI_RECONSIDER_ON = Object.freeze([
  'ocr-completed',
  'ocr-insufficient-input',
  'policy-change',
  'user-request',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function intent(decision, {
  executorClass = null,
  scope = 'self',
  reasonCodes,
  reconsiderOn = [],
} = {}) {
  return deepFreeze({
    decision,
    executorClass,
    scope,
    reasonCodes: [...reasonCodes].sort(),
    reconsiderOn: [...reconsiderOn].sort(),
  });
}

const skip = (reasonCode, scope = 'self') => intent('skip', {
  scope,
  reasonCodes: [reasonCode],
});
const defer = (reasonCode, reconsiderOn, scope = 'self') => intent('defer', {
  scope,
  reasonCodes: [reasonCode],
  reconsiderOn,
});
const block = (reasonCode, scope = 'self') => intent('block', {
  scope,
  reasonCodes: [reasonCode],
});
const approve = (executorClass, reasonCode, scope = 'self') => intent('approve', {
  executorClass,
  scope,
  reasonCodes: [reasonCode],
});

function reliableTime(fragment) {
  const fact = fragment.facts.capturedAt;
  const instant = fact?.value?.instant;
  if (['confirmed', 'corrected', 'suggested'].includes(fact?.status)
    && typeof instant === 'string'
    && /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(instant)
    && Number.isFinite(Date.parse(instant))) return true;
  return fragment.source.sourceCreatedAt !== null;
}

function hasReliableLocation(fragment) {
  return fragment.source.locationHint !== null;
}

function normalizeRepresentation(input, fragmentId) {
  if (!input || typeof input !== 'object'
    || !['independent', 'representative', 'supporting'].includes(input.role)
    || input.representativeRef?.type !== 'fragment'
    || typeof input.representativeRef.id !== 'string'
    || !Array.isArray(input.reasonCodes)
    || input.reasonCodes.length < 1) {
    throw new TypeError('representation is invalid');
  }
  if (input.role === 'supporting' && input.representativeRef.id === fragmentId) {
    throw new TypeError('supporting representation must point to another Fragment');
  }
  if (input.role !== 'supporting' && input.representativeRef.id !== fragmentId) {
    throw new TypeError('primary representation must point to itself');
  }
  return input;
}

function classificationFor(fragment) {
  const format = fragment.technicalMetadata?.format ?? null;
  if (format === 'pdf') {
    return {
      mediaKind: 'document',
      documentKind: 'pdf',
    };
  }
  if (fragment.type === 'text' || format === 'text') {
    return {
      mediaKind: 'text',
      documentKind: null,
    };
  }
  if (DOCUMENT_TYPES.has(fragment.type)) {
    return {
      mediaKind: 'document',
      documentKind: fragment.type,
    };
  }
  return {
    mediaKind: 'image',
    documentKind: null,
  };
}

export function classifyRoutingInput(input) {
  const fragment = parseFragment(input);
  const classification = classificationFor(fragment);
  return deepFreeze({
    ...classification,
    confidence: 1,
    basis: ['fragment-type', 'technical-metadata-format'],
  });
}

function allCapabilities(factory) {
  return Object.fromEntries(CAPABILITIES.map((capability) => [capability, factory(capability)]));
}

function supportingIntents(fragment, representation) {
  if (fragment.type !== 'photo' || representation.role !== 'supporting') return null;
  const reason = representation.reasonCodes
    .map((code) => SUPPORTING_RULES[code])
    .find(Boolean);
  if (!reason) return null;
  return allCapabilities(() => skip(reason, 'representative'));
}

function baseIntents(fragment, classification, representation) {
  const scope = representation.role === 'independent' ? 'self' : 'representative';
  if (classification.documentKind === 'pdf') {
    return {
      ocr: approve('document-ocr', 'pdf-document', scope),
      places: defer('await-ocr-result', ['ocr-completed', 'policy-change', 'user-request'], scope),
      embedding: defer('await-ocr-result', ['ocr-completed', 'policy-change', 'user-request'], scope),
      gemini: defer('await-structured-results', GEMINI_RECONSIDER_ON, scope),
    };
  }
  if (classification.mediaKind === 'text') {
    return {
      ocr: skip('text-direct-input', scope),
      places: defer(
        'await-text-place-clues',
        ['policy-change', 'user-request'],
        scope,
      ),
      embedding: approve('multimodal-embedding', 'text-direct-input', scope),
      gemini: defer('await-structured-results', GEMINI_RECONSIDER_ON, scope),
    };
  }
  if (classification.mediaKind === 'document') {
    return {
      ocr: approve('document-ocr', 'declared-document-type', scope),
      places: defer('await-ocr-result', ['ocr-completed', 'policy-change', 'user-request'], scope),
      embedding: approve('multimodal-embedding', 'declared-document-type', scope),
      gemini: defer('await-structured-results', GEMINI_RECONSIDER_ON, scope),
    };
  }
  return {
    ocr: skip('not-document-like', scope),
    places: hasReliableLocation(fragment)
      ? skip('gps-sufficient', scope)
      : defer('await-location-clues', ['policy-change', 'user-request'], scope),
    embedding: approve('multimodal-embedding', 'independent-fragment', scope),
    gemini: defer('await-structured-results', GEMINI_RECONSIDER_ON, scope),
  };
}

function applyPriorResults(intents, fragment, priorResults) {
  const ocr = priorResults?.ocr;
  if (ocr?.outcome !== 'completed' || ocr.structuredSufficient !== true) return intents;
  const placeClues = Array.isArray(ocr.placeClues) ? ocr.placeClues : [];
  return {
    ...intents,
    ocr: skip('result-already-available', intents.ocr.scope),
    places: hasReliableLocation(fragment)
      ? skip('gps-sufficient', intents.places.scope)
      : placeClues.length > 0
        ? approve('places-resolution', 'structured-place-clue', intents.places.scope)
        : defer(
          'await-location-clues',
          ['policy-change', 'user-request'],
          intents.places.scope,
        ),
    gemini: skip('structured-result-sufficient', intents.gemini.scope),
  };
}

function validGeminiEscalation(fragment, escalation, priorResults) {
  if (!escalation || priorResults?.ocr?.outcome === 'completed') return false;
  return escalation.fromCapability === 'ocr'
    && escalation.outcome === 'insufficient_input'
    && escalation.requestedCapability === 'gemini'
    && escalation.state === 'pending'
    && GEMINI_ESCALATION_TYPES.has(fragment.type);
}

function normalizeRequestContext(input) {
  const context = input ?? { kind: 'automatic', serverAuthenticated: true };
  if (!context || typeof context !== 'object'
    || !['automatic', 'explicit_reprocess'].includes(context.kind)
    || typeof context.serverAuthenticated !== 'boolean') {
    throw new TypeError('requestContext is invalid');
  }
  return context;
}

function revisionError() {
  const error = new Error('Automatic routing revision limit reached');
  error.name = 'RoutingPolicyError';
  error.code = 'routing/revision-limit';
  return error;
}

export function compileCapabilityIntents({
  fragment: fragmentInput,
  representation: representationInput,
  features = null,
  priorResults = {},
  escalation = null,
  revision = 1,
  requestContext: requestContextInput,
} = {}) {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new TypeError('revision is invalid');
  }
  if (revision > 5) throw revisionError();
  const fragment = parseFragment(fragmentInput);
  const representation = normalizeRepresentation(representationInput, fragment.id);
  const requestContext = normalizeRequestContext(requestContextInput);
  const classification = classifyRoutingInput(fragment);

  let intents;
  if (fragment.processing.deterministic?.state === 'failed_terminal') {
    intents = allCapabilities(() => block('deterministic-terminal-failure'));
  } else if (features?.lowInformation === true) {
    intents = allCapabilities(() => block('low-information'));
  } else {
    intents = supportingIntents(fragment, representation)
      ?? baseIntents(fragment, classification, representation);
    intents = applyPriorResults(intents, fragment, priorResults);
    if (validGeminiEscalation(fragment, escalation, priorResults)) {
      intents = {
        ...intents,
        ocr: skip('ocr-attempt-completed', intents.ocr.scope),
        gemini: approve('gemini-multimodal', 'ocr-insufficient-input', intents.gemini.scope),
      };
    }
  }

  const hasApprovedIntent = Object.values(intents)
    .some(({ decision }) => decision === 'approve');
  const priority = representation.role === 'supporting'
    ? 'low'
    : requestContext.kind === 'explicit_reprocess' && requestContext.serverAuthenticated
      ? 'high'
      : 'normal';
  const routeReasons = [...new Set([
    ...representation.reasonCodes,
    ...Object.values(intents).flatMap(({ reasonCodes }) => reasonCodes),
    ...(reliableTime(fragment) ? ['capture-time-present'] : ['capture-time-missing']),
    ...(hasReliableLocation(fragment) ? ['gps-present'] : ['gps-missing']),
  ])].sort();

  return deepFreeze({
    classification,
    intents,
    priority,
    budgetClass: hasApprovedIntent ? 'standard' : 'deterministic_only',
    routeReasons,
  });
}
