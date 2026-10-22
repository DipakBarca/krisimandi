// Gives an existing account the admin role, or takes it away.
//   npm run make-admin -- 98XXXXXXXX
//   npm run make-admin -- 98XXXXXXXX --remove
import { PrismaClient } from '@prisma/client';

async function main() {
  const [number, flag] = process.argv.slice(2);
  const digits = (number ?? '').replace(/\D/g, '').replace(/^977/, '');
  if (!/^9[678]\d{8}$/.test(digits)) {
    console.error('Give a 10-digit Nepali mobile number, e.g. npm run make-admin -- 9812345678');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const phone = `+977${digits}`;
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    console.error(`No account for ${phone}. Sign in on the website once first.`);
    process.exit(1);
  }
  const remove = flag === '--remove';
  const roles = remove ? user.roles.filter((r) => r !== 'ADMIN') : [...new Set([...user.roles, 'ADMIN' as const])];
  await prisma.user.update({ where: { id: user.id }, data: { roles } });
  await prisma.auditLog.create({
    data: { action: remove ? 'ADMIN_REMOVED' : 'ADMIN_GRANTED', entity: 'user', entityId: user.id, after: { roles } },
  });
  console.log(`${user.fullName || phone} is ${remove ? 'no longer' : 'now'} an admin.`);
  await prisma.$disconnect();
}

main();
