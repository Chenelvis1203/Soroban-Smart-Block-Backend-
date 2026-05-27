import '../config'; // load dotenv + active network profile
import { prismaWrite as prisma } from '../db';
import { startRepairLoop } from './repair';

async function main() {
  await prisma.$connect();
  await startRepairLoop();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
