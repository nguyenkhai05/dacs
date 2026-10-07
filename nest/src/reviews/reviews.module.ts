import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

@Module({
    imports: [DatabaseModule, AuthModule],
    controllers: [ReviewsController],
    providers: [ReviewsService],
})
export class ReviewsModule { }
