import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { SEEDED_MERCHANTS } from '../src/auth/seeded-credentials';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  for (const seeded of SEEDED_MERCHANTS) {
    await prisma.merchant.upsert({
      where: { email: seeded.email },
      update: {
        tier: seeded.tier,
        carrierAccountRef: seeded.carrierAccountRef,
        passwordHash: bcrypt.hashSync(seeded.password, 10),
      },
      create: {
        email: seeded.email,
        passwordHash: bcrypt.hashSync(seeded.password, 10),
        tier: seeded.tier,
        carrierAccountRef: seeded.carrierAccountRef,
      },
    });
  }
  const count = await prisma.merchant.count();
  console.log(`Seeded ${count} merchants`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());