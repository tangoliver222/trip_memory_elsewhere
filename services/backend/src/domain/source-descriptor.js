import { z } from 'zod';
import { IsoDateTimeSchema } from './common.js';

export const SourceTypeSchema = z.enum([
  'photo',
  'receipt',
  'ticket',
  'screenshot',
  'menu',
  'text',
]);

const NullableText = z.string().trim().min(1).max(1024).nullable();

const LocationHintSchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyMeters: z.number().positive(),
  source: z.enum(['camera_device', 'provider_metadata', 'user_supplied']),
});

const MediaSchema = z.strictObject({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const CommonSourceFields = {
  schemaVersion: z.literal(1),
  originalName: NullableText,
  sourceCreatedAt: IsoDateTimeSchema.nullable(),
  sourceModifiedAt: IsoDateTimeSchema.nullable(),
  timezoneOffsetMinutes: z.number().int().min(-840).max(840).nullable(),
  locationHint: LocationHintSchema.nullable(),
  media: MediaSchema.nullable(),
};

const LocalFileSourceSchema = z.strictObject({
  ...CommonSourceFields,
  provider: z.literal('local_file'),
  importMethod: z.literal('file_picker'),
  providerItemId: z.null(),
  providerMetadata: z.strictObject({}),
});

const DeviceCameraSourceSchema = z.strictObject({
  ...CommonSourceFields,
  provider: z.literal('device_camera'),
  importMethod: z.literal('camera_capture'),
  providerItemId: z.null(),
  providerMetadata: z.strictObject({}),
});

const GooglePhotosSourceSchema = z.strictObject({
  ...CommonSourceFields,
  provider: z.literal('google_photos'),
  importMethod: z.literal('google_photos_picker'),
  providerItemId: z.string().trim().min(1).max(1024),
  providerMetadata: z.strictObject({
    cameraMake: NullableText,
    cameraModel: NullableText,
    focalLengthMm: z.number().positive().nullable(),
    apertureFNumber: z.number().positive().nullable(),
    isoEquivalent: z.number().int().positive().nullable(),
    exposureTimeSeconds: z.number().positive().nullable(),
  }),
});

const PastedTextSourceSchema = z.strictObject({
  ...CommonSourceFields,
  provider: z.literal('pasted_text'),
  importMethod: z.literal('paste'),
  providerItemId: z.null(),
  providerMetadata: z.strictObject({
    title: z.string().trim().min(1).max(512).nullable(),
  }),
});

export const SourceDescriptorSchema = z.discriminatedUnion('provider', [
  LocalFileSourceSchema,
  DeviceCameraSourceSchema,
  GooglePhotosSourceSchema,
  PastedTextSourceSchema,
]);

export const parseSourceDescriptor = (input) => SourceDescriptorSchema.parse(input);
