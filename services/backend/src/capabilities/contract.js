const PORT_METHODS = Object.freeze({
  dispatcher: Object.freeze(['enqueueOcrTask']),
  ocrProvider: Object.freeze(['process']),
  artifactStore: Object.freeze(['putNormalizedArtifact', 'putProviderArtifact']),
});

function assertPort(value, name, methods) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} is invalid`);
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== methods.length
    || keys.some((key, index) => key !== methods[index])
    || methods.some((method) => typeof value[method] !== 'function')) {
    throw new TypeError(`${name} is invalid`);
  }
  return value;
}

export const assertCapabilityDispatcher = (value) => (
  assertPort(value, 'capability dispatcher', PORT_METHODS.dispatcher)
);

export const assertOcrProvider = (value) => (
  assertPort(value, 'OCR provider', PORT_METHODS.ocrProvider)
);

export const assertCapabilityArtifactStore = (value) => (
  assertPort(value, 'capability artifact store', PORT_METHODS.artifactStore)
);
