import { z } from 'zod';

/**
 * Shared validation schemas — single source of truth for the request
 * contract between the API server and the web client (constitution V).
 *
 * Deliberately absent: any carrier-coverage / serviceability rule. A lane
 * that no carrier serves is a VALID shipment with an empty result (FR-003).
 */

const countryCode = z
  .string()
  .regex(/^[A-Z]{2}$/, 'Must be an ISO 3166-1 alpha-2 country code');

const ianaZone = z
  .string()
  .refine(
    (value) => Intl.supportedValuesOf('timeZone').includes(value),
    { message: 'Must be a valid IANA time zone name (e.g. America/New_York)' },
  );

const positiveNumber = z
  .number()
  .positive('Must be strictly positive');

export const shipmentSchema = z.object({
  origin: z.object({
    countryCode: countryCode,
    postcode: z.string().min(1, 'Required'),
    timezone: ianaZone,
  }),
  destination: z.object({
    countryCode: countryCode,
    postcode: z.string().min(1, 'Required'),
  }),
  parcel: z.object({
    weightKg: positiveNumber,
    lengthCm: positiveNumber,
    widthCm: positiveNumber,
    heightCm: positiveNumber,
  }),
  quotedAt: z
    .string()
    .datetime({ offset: true })
    .optional(),
});

export type Shipment = z.infer<typeof shipmentSchema>;

export const carrierIdSchema = z.enum(['SWIFTPOST', 'ATLAS', 'MERIDIAN']);
export type CarrierId = z.infer<typeof carrierIdSchema>;

export const rateSchema = z.object({
  carrier: carrierIdSchema,
  service: z.string(),
  baseMinor: z.number().int(),
  taxMinor: z.number().int(),
  totalMinor: z.number().int(),
  currency: z.literal('USD'),
  etaFrom: z.string(),
  etaTo: z.string(),
});

export type Rate = z.infer<typeof rateSchema>;

export const carrierStatusSchema = z.object({
  carrier: carrierIdSchema,
  status: z.enum(['FAILED', 'NO_SERVICE', 'GIVEN_UP']),
  errorCode: z.string(),
  errorDetail: z.string(),
});

export type CarrierStatus = z.infer<typeof carrierStatusSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const merchantTierSchema = z.enum(['standard', 'plus', 'enterprise']);
export type MerchantTier = z.infer<typeof merchantTierSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  merchant: z.object({
    id: z.string(),
    email: z.string(),
    tier: merchantTierSchema,
  }),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;