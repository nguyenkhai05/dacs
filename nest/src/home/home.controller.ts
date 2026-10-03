import { Controller, Get, Query } from '@nestjs/common';

import { HomeQueryDto } from './dto/home-query.dto.js';
import { HomeService } from './home.service.js';

@Controller('home')
export class HomeController {
    constructor(private readonly homeService: HomeService) { }

    // Dữ liệu cho cả trang chủ: danh sách loại sân + "Sân nổi bật hôm nay"
    @Get()
    getHome(@Query() query: HomeQueryDto) {
        return this.homeService.getHome(query.date);
    }

    // Nút "Tìm sân trống": lọc theo ngày + loại sân
    @Get('pitches')
    searchPitches(@Query() query: HomeQueryDto) {
        return this.homeService.searchPitches(
            query.date,
            query.category_id,
        );
    }
}
