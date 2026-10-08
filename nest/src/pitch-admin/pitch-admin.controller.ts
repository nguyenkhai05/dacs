import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';

import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import {
    CreateCategoryDto,
    CreatePitchDto,
    CreatePriceSlotDto,
    ListAdminPitchesQueryDto,
    PricePreviewQueryDto,
    UpdateCategoryDto,
    UpdatePitchDto,
    UpdatePitchStatusDto,
    UpdatePriceSlotDto,
} from './dto/pitch-admin.dto.js';
import { PitchAdminService } from './pitch-admin.service.js';

// Màn 15 - Sân & bảng giá. Mặc định Admin + Staff được xem;
// các thao tác ghi cần Admin (riêng đổi trạng thái sân cho cả Staff, vd đưa vào bảo trì).
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin', 'Staff')
export class PitchAdminController {
    constructor(private readonly service: PitchAdminService) { }

    // ----- Sân -----

    @Get('pitches')
    listPitches(@Query() query: ListAdminPitchesQueryDto) {
        return this.service.listPitches(query);
    }

    @Get('pitches/:id')
    getPitch(@Param('id', ParseIntPipe) id: number) {
        return this.service.getPitch(id);
    }

    @Post('pitches')
    @Roles('Admin')
    createPitch(@CurrentUser() user: AuthUser, @Body() dto: CreatePitchDto) {
        return this.service.createPitch(Number(user.sub), dto);
    }

    @Patch('pitches/:id')
    @Roles('Admin')
    updatePitch(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePitchDto,
    ) {
        return this.service.updatePitch(Number(user.sub), id, dto);
    }

    @Patch('pitches/:id/status')
    changeStatus(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePitchStatusDto,
    ) {
        return this.service.changePitchStatus(Number(user.sub), id, dto.status);
    }

    // ----- Loại sân -----

    @Get('pitch-categories')
    listCategories() {
        return this.service.listCategories();
    }

    @Post('pitch-categories')
    @Roles('Admin')
    createCategory(@Body() dto: CreateCategoryDto) {
        return this.service.createCategory(dto);
    }

    @Patch('pitch-categories/:id')
    @Roles('Admin')
    updateCategory(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateCategoryDto,
    ) {
        return this.service.updateCategory(id, dto);
    }

    // ----- Bảng giá -----

    @Get('pitch-categories/:id/price-slots')
    listPriceSlots(@Param('id', ParseIntPipe) id: number) {
        return this.service.listPriceSlots(id);
    }

    @Post('pitch-categories/:id/price-slots')
    @Roles('Admin')
    createPriceSlot(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: CreatePriceSlotDto,
    ) {
        return this.service.createPriceSlot(Number(user.sub), id, dto);
    }

    // Bảng giá thực tế áp dụng cho một ngày (đã tính thứ trong tuần / ngày lễ)
    @Get('pitch-categories/:id/price-preview')
    previewPrice(
        @Param('id', ParseIntPipe) id: number,
        @Query() query: PricePreviewQueryDto,
    ) {
        return this.service.previewPrice(id, query.date);
    }

    @Get('pitch-categories/:id/price-history')
    getPriceHistory(@Param('id', ParseIntPipe) id: number) {
        return this.service.getPriceHistory(id);
    }

    @Patch('price-slots/:id')
    @Roles('Admin')
    updatePriceSlot(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePriceSlotDto,
    ) {
        return this.service.updatePriceSlot(Number(user.sub), id, dto);
    }

    @Delete('price-slots/:id')
    @Roles('Admin')
    deletePriceSlot(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.deletePriceSlot(Number(user.sub), id);
    }
}
