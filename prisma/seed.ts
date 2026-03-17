import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Check if admin already exists
  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'admin' },
  });

  if (existingAdmin) {
    console.log('Admin user already exists, skipping admin creation');
  } else {
    // Create default admin user
    // Note: In production, change this password immediately after first login
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.create({
      data: {
        email: 'admin@owu.local',
        username: 'admin',
        password: hashedPassword,
        role: 'admin',
      },
    });
    console.log(`Created admin user: ${admin.username} (id: ${admin.id})`);
  }

  // Initialize system config if not exists
  const existingConfig = await prisma.systemConfig.findFirst();
  if (existingConfig) {
    console.log('System config already exists, skipping initialization');
  } else {
    const config = await prisma.systemConfig.create({
      data: {
        allowedModels: ['gpt-4o-mini', 'gpt-4o'],
      },
    });
    console.log(`Created system config (id: ${config.id})`);
  }

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });