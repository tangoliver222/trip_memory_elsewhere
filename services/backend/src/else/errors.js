const MESSAGES = Object.freeze({
  'else/invalid-request': 'Else request is invalid',
  'else/budget-exhausted': 'Else query budget is exhausted',
  'else/provider-failed': 'Else could not complete the answer',
  'else/unavailable': 'Else is temporarily unavailable',
});

export class ElseQueryError extends Error {
  constructor(code) {
    super(MESSAGES[code] ?? MESSAGES['else/unavailable']);
    this.name = 'ElseQueryError';
    this.code = Object.hasOwn(MESSAGES, code) ? code : 'else/unavailable';
  }
}
