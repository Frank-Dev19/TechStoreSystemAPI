import { Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { MailerController } from './mailer.controller';
import { ConfigModule } from '@nestjs/config';
import { MailSettingsModule } from '../mail-settings/mail-settings.module';
@Module({
    imports: [ConfigModule, MailSettingsModule],
    providers: [MailerService],
    controllers: [MailerController],
    exports: [MailerService],
})
export class MailerModule { }
