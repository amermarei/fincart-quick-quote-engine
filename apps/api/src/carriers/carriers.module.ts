import { Module } from '@nestjs/common';
import { AtlasCarrierStrategy } from './atlas.carrier';
import { MeridianCarrierStrategy } from './meridian.carrier';
import { SwiftPostCarrierStrategy } from './swiftpost.carrier';
import { CARRIER_STRATEGIES, CarrierStrategyContext } from './carrier-strategy.context';

/**
 * Registers every carrier strategy as a NestJS provider and publishes the
 * multi-provider CARRIER_STRATEGIES token so the context (and anything that
 * extends the system) receives the full strategy set through DI.
 */
@Module({
  providers: [
    MeridianCarrierStrategy,
    SwiftPostCarrierStrategy,
    AtlasCarrierStrategy,
    CarrierStrategyContext,
    {
      provide: CARRIER_STRATEGIES,
      useFactory: (
        meridian: MeridianCarrierStrategy,
        swiftpost: SwiftPostCarrierStrategy,
        atlas: AtlasCarrierStrategy,
      ) => [meridian, swiftpost, atlas],
      inject: [MeridianCarrierStrategy, SwiftPostCarrierStrategy, AtlasCarrierStrategy],
    },
  ],
  exports: [CarrierStrategyContext, CARRIER_STRATEGIES],
})
export class CarriersModule {}