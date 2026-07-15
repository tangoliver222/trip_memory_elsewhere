import { z } from 'zod';

export const IdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);
export const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const ReferenceSchema = z.strictObject({
  type: z.enum([
    'fragment',
    'entity',
    'place',
    'visit',
    'scene',
    'connection',
    'discovery',
    'note',
    'journey',
    'city',
    'importBatch',
  ]),
  id: IdSchema,
});

export const CommonFields = {
  id: IdSchema,
  ownerId: IdSchema,
  schemaVersion: z.literal(1),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  deletedAt: IsoDateTimeSchema.nullable(),
};

export const parseReference = (input) => ReferenceSchema.parse(input);
