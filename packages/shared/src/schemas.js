"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginResponseSchema = exports.merchantTierSchema = exports.loginRequestSchema = exports.carrierStatusSchema = exports.rateSchema = exports.carrierIdSchema = exports.shipmentSchema = void 0;
const zod_1 = require("zod");
/**
 * Shared validation schemas — single source of truth for the request
 * contract between the API server and the web client (constitution V).
 *
 * Deliberately absent: any carrier-coverage / serviceability rule. A lane
 * that no carrier serves is a VALID shipment with an empty result (FR-003).
 */
const countryCode = zod_1.z
    .string()
    .regex(/^[A-Z]{2}$/, 'Must be an ISO 3166-1 alpha-2 country code');
const ianaZone = zod_1.z
    .string()
    .refine((value) => Intl.supportedValuesOf('timeZone').includes(value), { message: 'Must be a valid IANA time zone name (e.g. America/New_York)' });
const positiveNumber = zod_1.z
    .number()
    .positive('Must be strictly positive');
exports.shipmentSchema = zod_1.z.object({
    origin: zod_1.z.object({
        countryCode: countryCode,
        postcode: zod_1.z.string().min(1, 'Required'),
        timezone: ianaZone,
    }),
    destination: zod_1.z.object({
        countryCode: countryCode,
        postcode: zod_1.z.string().min(1, 'Required'),
    }),
    parcel: zod_1.z.object({
        weightKg: positiveNumber,
        lengthCm: positiveNumber,
        widthCm: positiveNumber,
        heightCm: positiveNumber,
    }),
    quotedAt: zod_1.z
        .string()
        .datetime({ offset: true })
        .optional(),
});
exports.carrierIdSchema = zod_1.z.enum(['SWIFTPOST', 'ATLAS', 'MERIDIAN']);
exports.rateSchema = zod_1.z.object({
    carrier: exports.carrierIdSchema,
    service: zod_1.z.string(),
    baseMinor: zod_1.z.number().int(),
    taxMinor: zod_1.z.number().int(),
    totalMinor: zod_1.z.number().int(),
    currency: zod_1.z.literal('USD'),
    etaFrom: zod_1.z.string(),
    etaTo: zod_1.z.string(),
});
exports.carrierStatusSchema = zod_1.z.object({
    carrier: exports.carrierIdSchema,
    status: zod_1.z.enum(['FAILED', 'NO_SERVICE', 'GIVEN_UP']),
    errorCode: zod_1.z.string(),
    errorDetail: zod_1.z.string(),
});
exports.loginRequestSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
exports.merchantTierSchema = zod_1.z.enum(['standard', 'plus', 'enterprise']);
exports.loginResponseSchema = zod_1.z.object({
    accessToken: zod_1.z.string(),
    merchant: zod_1.z.object({
        id: zod_1.z.string(),
        email: zod_1.z.string(),
        tier: exports.merchantTierSchema,
    }),
});
//# sourceMappingURL=schemas.js.map