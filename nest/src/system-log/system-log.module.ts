import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { SystemLogController } from './system-log.controller.js';
import { SystemLogService } from './system-log.service.js';

@Module({
    imports: [DatabaseModule, AuthModule],
    controllers: [SystemLogController],
    providers: [SystemLogService],
})
export class SystemLogModule {}
