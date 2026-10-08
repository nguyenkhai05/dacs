import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { PitchAdminController } from './pitch-admin.controller.js';
import { PitchAdminService } from './pitch-admin.service.js';

@Module({
    imports: [DatabaseModule, AuthModule],
    controllers: [PitchAdminController],
    providers: [PitchAdminService],
})
export class PitchAdminModule { }
