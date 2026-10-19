import { PrismaClient } from '@prisma/client';
import locations from '../seed/locations.json';
import catalogue from '../seed/catalogue.json';

const prisma = new PrismaClient();

async function main() {
  for (const p of locations.provinces) {
    await prisma.province.upsert({ where: { id: p.id }, update: p, create: p });
  }
  for (const d of locations.districts) {
    await prisma.district.upsert({ where: { id: d.id }, update: d, create: d });
  }
  for (const { wards, ...m } of locations.municipalities) {
    await prisma.municipality.upsert({ where: { id: m.id }, update: m, create: m });
    // wards is null until the count is confirmed; seed none for that unit.
    for (let wardNo = 1; wardNo <= (wards ?? 0); wardNo++) {
      await prisma.ward.upsert({
        where: { municipalityId_wardNo: { municipalityId: m.id, wardNo } },
        update: {},
        create: { municipalityId: m.id, wardNo },
      });
    }
  }

  for (const u of catalogue.units) {
    await prisma.unit.upsert({ where: { code: u.code }, update: u, create: u });
  }
  for (const { unit, ...c } of catalogue.crops) {
    const defaultUnit = await prisma.unit.findUniqueOrThrow({ where: { code: unit } });
    const data = { ...c, defaultUnitId: defaultUnit.id };
    await prisma.crop.upsert({ where: { nameEn: c.nameEn }, update: data, create: data });
  }

  const counts = {
    municipalities: await prisma.municipality.count(),
    wards: await prisma.ward.count(),
    units: await prisma.unit.count(),
    crops: await prisma.crop.count(),
  };
  console.log('Seeded', counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
