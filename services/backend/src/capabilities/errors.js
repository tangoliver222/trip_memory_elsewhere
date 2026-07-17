const DEFINITIONS = Object.freeze({
  'capability/dispatch-unavailable': Object.freeze({ retryable: true, billingUncertain: false }),
  'capability/repository-unavailable': Object.freeze({ retryable: true, billingUncertain: false }),
  'capability/provider-unavailable': Object.freeze({ retryable: true, billingUncertain: false }),
  'capability/provider-call-uncertain': Object.freeze({ retryable: false, billingUncertain: true }),
  'capability/provider-result-invalid': Object.freeze({ retryable: false, billingUncertain: false }),
  'capability/input-unsupported': Object.freeze({ retryable: false, billingUncertain: false }),
  'capability/artifact-conflict': Object.freeze({ retryable: false, billingUncertain: true }),
});

export class CapabilityError extends Error {
  constructor(code, options) {
    const definition = DEFINITIONS[code];
    const keys = options && typeof options === 'object' && !Array.isArray(options)
      ? Object.keys(options).sort()
      : [];
    if (!definition
      || keys.length !== 2
      || keys[0] !== 'billingUncertain'
      || keys[1] !== 'retryable'
      || options.retryable !== definition.retryable
      || options.billingUncertain !== definition.billingUncertain) {
      throw new TypeError('Capability error classification is invalid');
    }
    super('Capability operation failed');
    this.name = 'CapabilityError';
    this.code = code;
    this.retryable = definition.retryable;
    this.billingUncertain = definition.billingUncertain;
  }
}
