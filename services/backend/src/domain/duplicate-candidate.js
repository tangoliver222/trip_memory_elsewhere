import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.js';

const FragmentReferenceSchema = z.strictObject({
  type: z.literal('fragment'),
  id: IdSchema,
});

const PairRefsSchema = z.tuple([FragmentReferenceSchema, FragmentReferenceSchema]);

const ExactDuplicateCandidateSchema = z.strictObject({
  id: IdSchema,
  ownerId: IdSchema,
  kind: z.literal('exact'),
  canonicalFragmentRef: FragmentReferenceSchema,
  candidateFragmentRef: FragmentReferenceSchema,
  pairRefs: PairRefsSchema,
  algorithm: z.literal('sha256'),
  algorithmVersion: z.literal('v1'),
  distance: z.literal(0),
  createdByTaskId: IdSchema,
  status: z.literal('suggested'),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

const NearDuplicateCandidateSchema = z.strictObject({
  id: IdSchema,
  ownerId: IdSchema,
  kind: z.literal('near'),
  queryFragmentRef: FragmentReferenceSchema,
  matchedFragmentRef: FragmentReferenceSchema,
  pairRefs: PairRefsSchema,
  pairKey: IdSchema,
  algorithm: z.literal('dhash'),
  algorithmVersion: z.literal('v1'),
  distance: z.number().int().nonnegative().max(6),
  rank: z.number().int().min(1).max(5),
  createdByTaskId: IdSchema,
  status: z.literal('suggested'),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const DuplicateCandidateSchema = z.discriminatedUnion('kind', [
  ExactDuplicateCandidateSchema,
  NearDuplicateCandidateSchema,
]).superRefine((candidate, context) => {
  const roleRefs = candidate.kind === 'exact'
    ? [candidate.canonicalFragmentRef, candidate.candidateFragmentRef]
    : [candidate.queryFragmentRef, candidate.matchedFragmentRef];
  const roleIds = roleRefs.map(({ id }) => id);
  if (new Set(roleIds).size !== 2) {
    context.addIssue({
      code: 'custom',
      message: 'Duplicate candidate roles must reference distinct fragments',
      path: [candidate.kind === 'exact' ? 'canonicalFragmentRef' : 'queryFragmentRef'],
    });
  }

  const expectedIds = [...roleIds].sort();
  const pairIds = candidate.pairRefs.map(({ id }) => id);
  if (pairIds.some((id, index) => id !== expectedIds[index])) {
    context.addIssue({
      code: 'custom',
      message: 'pairRefs must contain the role fragments sorted by ID',
      path: ['pairRefs'],
    });
  }
});

export const parseDuplicateCandidate = (input) => DuplicateCandidateSchema.parse(input);
