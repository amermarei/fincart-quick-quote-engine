import { Module } from '@nestjs/common';
import { CarriersModule } from '../carriers/carriers.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [CarriersModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}