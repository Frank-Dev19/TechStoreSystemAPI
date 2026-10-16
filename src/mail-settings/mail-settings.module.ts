import { MailtrapApiService } from './mailtrap-api.service';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailSetting } from './entities/mail-setting.entity';
import { MailSettingsController } from './mail-settings.controller';
import { MailSettingsService } from './mail-settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([MailSetting])],
  controllers: [MailSettingsController],
  providers: [MailSettingsService, MailtrapApiService],
  exports: [MailSettingsService],
})
export class MailSettingsModule {}

