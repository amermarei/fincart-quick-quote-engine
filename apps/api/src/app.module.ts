import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { QuotesModule } from './quotes/quotes.module';

@Module({
  imports: [PrismaModule, AuthModule, QuotesModule],
})
export class AppModule {}