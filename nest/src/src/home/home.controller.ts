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

    // Màn 04/05: tìm sân + bộ lọc (ngày, loại sân, từ khóa, quận, khoảng giá,
    // tiện ích, sắp xếp, phân trang)
    @Get('pitches')
    searchPitches(@Query() query: HomeQueryDto) {
        return this.homeService.searchPitches(query);
    }
}
