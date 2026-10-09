import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ServiceAdminController } from './service-admin.controller.js';
import { ServiceAdminService } from './service-admin.service.js';

@Module({
    imports: [DatabaseModule, AuthModule],
    controllers: [ServiceAdminController],
    providers: [ServiceAdminService],
})
export class ServiceAdminModule { }
