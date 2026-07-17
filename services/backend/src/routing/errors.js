const DEFINITIONS = Object.freeze({
  'routing/repository-unavailable': {
    message: 'Routing state is temporarily unavailable',
    retryable: true,
  },
});

export class RoutingServiceError extends Error {
  constructor(code) {
    const definition = DEFINITIONS[code];
    if (!definition) throw new TypeError('Unknown routing error code');
    super(definition.message);
    this.name = 'RoutingServiceError';
    this.code = code;
    this.retryable = definition.retryable;
  }
}
