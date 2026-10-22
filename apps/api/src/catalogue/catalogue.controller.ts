import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { Public } from '../auth/guards';
import { PrismaService } from '../prisma.service';

/** Lookup lists for forms: locations, crops and units, in both languages. */
@Public()
@Controller()
export class CatalogueController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('locations/districts')
  districts() {
    return this.prisma.district.findMany({ include: { province: true }, orderBy: { nameEn: 'asc' } });
  }

  @Get('locations/municipalities')
  municipalities(@Query('districtId') districtId?: string) {
    return this.prisma.municipality.findMany({
      where: districtId ? { districtId: Number(districtId) } : undefined,
      orderBy: { nameEn: 'asc' },
    });
  }

  @Get('locations/municipalities/:id/wards')
  wards(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.ward.findMany({ where: { municipalityId: id }, orderBy: { wardNo: 'asc' } });
  }

  @Get('crops')
  crops() {
    return this.prisma.crop.findMany({ include: { defaultUnit: true }, orderBy: { nameEn: 'asc' } });
  }

  @Get('units')
  units() {
    return this.prisma.unit.findMany({ orderBy: { id: 'asc' } });
  }
}
