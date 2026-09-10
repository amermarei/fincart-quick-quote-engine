import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { shipmentSchema } from '@qqe/shared';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QuotesService } from './quotes.service';
import type { AuthedRequest, QuoteStreamEvent } from './quotes.types';

function writeSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

@UseGuards(JwtAuthGuard)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Post()
  @HttpCode(200)
  async create(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body() body: unknown,
  ): Promise<void> {
    const parsed = shipmentSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
      throw new BadRequestException(messages);
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const emit = (event: QuoteStreamEvent): void => {
      if (event.event === 'request') {
        writeSse(res, 'request', { requestId: event.requestId });
      } else if (event.event === 'done') {
        writeSse(res, 'done', { requestId: event.requestId });
        res.end();
      } else if (event.status === 'QUOTED') {
        writeSse(res, 'rate', event.rate);
      } else {
        writeSse(res, 'carrier-status', {
          carrier: event.carrier,
          status: event.status,
          errorCode: event.errorCode,
          errorDetail: event.errorDetail,
        });
      }
    };

    await this.quotes.quote(parsed.data, req.user, emit);
  }

  @Get()
  async history(@Req() req: AuthedRequest) {
    const requests = await this.quotes.historyForMerchant(req.user.id);
    return { quotes: requests };
  }
}