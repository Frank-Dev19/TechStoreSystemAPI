import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SubmitServiceOrderSurveyDto } from './dto/submit-service-order-survey.dto';
import { ServiceOrderSurveyService } from './service-order-survey.service';

@Controller('service-orders/surveys')
export class ServiceOrderSurveyController {
  constructor(private readonly service: ServiceOrderSurveyService) {}

  @Get(':token')
  getSurvey(@Param('token') token: string) {
    return this.service.getPublicSurvey(token);
  }

  @Post(':token')
  submitSurvey(@Param('token') token: string, @Body() dto: SubmitServiceOrderSurveyDto) {
    return this.service.submit(token, dto);
  }
}
