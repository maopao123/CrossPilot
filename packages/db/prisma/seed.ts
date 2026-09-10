import { PrismaClient, UserStatus, WorkspaceRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting CrossPilot Seed...');

  // 1. Marketplace: AMAZON_US
  const marketplace = await prisma.marketplace.upsert({
    where: { code: 'AMAZON_US' },
    update: {},
    create: {
      code: 'AMAZON_US',
      name: 'Amazon US',
      countryCode: 'US',
      currencyCode: 'USD',
      languageCode: 'en-US',
      timezone: 'America/Los_Angeles',
      isActive: true,
    },
  });
  console.log(`✅ Marketplace ready: ${marketplace.name} (${marketplace.code})`);

  // 2. Demo User
  const passwordHash = await bcrypt.hash('crosspilot123', 10);
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@crosspilot.com' },
    update: {},
    create: {
      email: 'demo@crosspilot.com',
      name: 'CrossPilot Demo User',
      passwordHash,
      status: UserStatus.ACTIVE,
    },
  });
  console.log(`✅ Demo user ready: ${demoUser.email} (${demoUser.id})`);

  // 3. Demo Workspace
  const demoWorkspace = await prisma.workspace.upsert({
    where: { slug: 'crosspilot-demo' },
    update: {
      defaultMarketplaceId: marketplace.id,
    },
    create: {
      name: 'CrossPilot Demo',
      slug: 'crosspilot-demo',
      defaultMarketplaceId: marketplace.id,
    },
  });
  console.log(`✅ Demo workspace ready: ${demoWorkspace.name} (${demoWorkspace.id})`);

  // 4. Workspace Membership
  const membership = await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: demoWorkspace.id,
        userId: demoUser.id,
      },
    },
    update: {
      role: WorkspaceRole.OWNER,
    },
    create: {
      workspaceId: demoWorkspace.id,
      userId: demoUser.id,
      role: WorkspaceRole.OWNER,
    },
  });
  console.log(`✅ Workspace membership ready: ${membership.role}`);

  console.log('🎉 Seed complete successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
