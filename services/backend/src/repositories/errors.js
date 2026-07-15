export class RepositoryConflictError extends Error {
  constructor(message = 'Object already exists') {
    super(message);
    this.name = 'RepositoryConflictError';
    this.code = 'repository/conflict';
  }
}

export class RepositoryOwnerError extends Error {
  constructor(message = 'Object owner does not match repository scope') {
    super(message);
    this.name = 'RepositoryOwnerError';
    this.code = 'repository/owner-mismatch';
  }
}
