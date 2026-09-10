import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { loginResponseSchema, type LoginRequest, type LoginResponse, type MerchantTier } from '@qqe/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthenticatedMerchant {
  id: string;
  email: string;
  tier: MerchantTier;
  carrierAccountRef: string;
}

const DB_TIER_TO_SHARED: Record<string, MerchantTier> = {
  STANDARD: 'standard',
  PLUS: 'plus',
  ENTERPRISE: 'enterprise',
};

const MERCHANT_CACHE_TTL_MS = 30_000;

@Injectable()
export class AuthService {
  private readonly merchantCache = new Map<string, { merchant: AuthenticatedMerchant; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(req: LoginRequest): Promise<LoginResponse> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { email: req.email },
    });
    if (!merchant || !bcrypt.compareSync(req.password, merchant.passwordHash)) {
      throw new Error('INVALID_CREDENTIALS');
    }
    const accessToken = await this.jwt.signAsync({ sub: merchant.id });
    return loginResponseSchema.parse({
      accessToken,
      merchant: {
        id: merchant.id,
        email: merchant.email,
        tier: DB_TIER_TO_SHARED[merchant.tier] ?? 'standard',
      },
    });
  }

  async findById(id: string): Promise<AuthenticatedMerchant | null> {
    const cached = this.merchantCache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.merchant;
    }

    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) return null;

    const resolved: AuthenticatedMerchant = {
      id: merchant.id,
      email: merchant.email,
      tier: DB_TIER_TO_SHARED[merchant.tier] ?? 'standard',
      carrierAccountRef: merchant.carrierAccountRef,
    };

    // Short-TTL cache (30 s): keeps the latency contract when the database is
    // remote (Aiven) without ever trusting token claims — the merchant record
    // is still the only source of tier/accountRef (constitution).
    this.merchantCache.set(id, { merchant: resolved, expiresAt: Date.now() + MERCHANT_CACHE_TTL_MS });
    return resolved;
  }
}