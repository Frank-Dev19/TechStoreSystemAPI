import { Module } from '@nestjs/common';
import { QzSigningController } from './qz-signing.controller';
import { QzSigningService } from './qz-signing.service';

@Module({
  controllers: [QzSigningController],
  providers: [QzSigningService],
})
export class PrintingModule {}
