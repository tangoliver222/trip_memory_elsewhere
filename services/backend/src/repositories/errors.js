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

export class RepositoryUnregisteredOriginalError extends Error {
  constructor(message = 'Original is not registered in this import batch') {
    super(message);
    this.name = 'RepositoryUnregisteredOriginalError';
    this.code = 'repository/unregistered-original';
  }
}

export class RepositoryOriginalConflictError extends Error {
  constructor(message = 'Original generation conflicts with stored outcome') {
    super(message);
    this.name = 'RepositoryOriginalConflictError';
    this.code = 'repository/original-conflict';
  }
}
