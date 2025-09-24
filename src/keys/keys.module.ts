import { Module } from '@nestjs/common';
import { KeysService } from './keys.service';
import { KeysController } from './keys.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OperationKey } from './entities/operation-key.entity';


@Module({
  imports: [TypeOrmModule.forFeature([OperationKey])],
  providers: [KeysService],
  controllers: [KeysController],
  exports: [KeysService]
})
export class KeysModule { }
