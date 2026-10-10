import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { UserAdminController } from './user-admin.controller.js';
import { UserAdminService } from './user-admin.service.js';

@Module({
    imports: [DatabaseModule, AuthModule],
    controllers: [UserAdminController],
    providers: [UserAdminService],
})
export class UserAdminModule { }
