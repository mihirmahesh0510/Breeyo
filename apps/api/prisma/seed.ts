import { PrismaClient } from '@prisma/client';
import { seedServiceCatalog } from '../src/modules/billing/service-catalog-seed.js';

const prisma = new PrismaClient();

const PERMISSIONS = [
  // Patients
  { code: 'VIEW_PATIENTS', description: 'View patient records', module: 'patients' },
  { code: 'EDIT_PATIENTS', description: 'Create/update patient records', module: 'patients' },
  { code: 'DELETE_PATIENTS', description: 'Delete patient records', module: 'patients' },
  // Queue
  { code: 'VIEW_QUEUE', description: 'View walk-in queue', module: 'queue' },
  { code: 'MANAGE_QUEUE', description: 'Add/remove patients from queue', module: 'queue' },
  // EMR
  { code: 'VIEW_EMR', description: 'View clinical records', module: 'emr' },
  { code: 'EDIT_EMR', description: 'Create/update clinical records', module: 'emr' },
  // Inventory
  { code: 'VIEW_INVENTORY', description: 'View inventory items', module: 'inventory' },
  { code: 'MANAGE_INVENTORY', description: 'Add/update/delete inventory items', module: 'inventory' },
  // Invoicing
  { code: 'VIEW_INVOICES', description: 'View invoices', module: 'invoicing' },
  { code: 'CREATE_INVOICES', description: 'Create new invoices', module: 'invoicing' },
  { code: 'MANAGE_PAYMENTS', description: 'Record payments', module: 'invoicing' },
  // Communication
  { code: 'SEND_WHATSAPP', description: 'Send WhatsApp messages', module: 'communication' },
  // Scheduling
  { code: 'VIEW_SCHEDULE', description: 'View appointments', module: 'scheduling' },
  { code: 'MANAGE_SCHEDULE', description: 'Create/update/cancel appointments', module: 'scheduling' },
  // Admin
  { code: 'MANAGE_USERS', description: 'Invite, deactivate, reactivate staff', module: 'admin' },
  { code: 'MANAGE_ROLES', description: 'Assign roles and permission overrides', module: 'admin' },
  { code: 'MANAGE_CLINIC_SETTINGS', description: 'Update clinic profile, hours, settings', module: 'admin' },
  { code: 'VIEW_AUDIT_LOG', description: 'View audit trail', module: 'admin' },
  { code: 'MANAGE_BILLING', description: 'Manage subscription and billing settings', module: 'admin' },
];

const ROLES = [
  { name: 'Admin', description: 'Full access to all clinic features' },
  { name: 'Clinician', description: 'Veterinarian with clinical access' },
  { name: 'FrontDesk', description: 'Reception and queue management' },
  { name: 'InventoryManager', description: 'Inventory and stock management' },
];

// Default permissions per role (from RESEARCH.md Appendix)
const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  Admin: PERMISSIONS.map((p) => p.code), // All permissions
  Clinician: [
    'VIEW_PATIENTS', 'EDIT_PATIENTS',
    'VIEW_QUEUE', 'MANAGE_QUEUE',
    'VIEW_EMR', 'EDIT_EMR',
    'VIEW_INVENTORY',
    'VIEW_INVOICES', 'CREATE_INVOICES',
    'SEND_WHATSAPP',
    'VIEW_SCHEDULE', 'MANAGE_SCHEDULE',
  ],
  FrontDesk: [
    'VIEW_PATIENTS', 'EDIT_PATIENTS',
    'VIEW_QUEUE', 'MANAGE_QUEUE',
    'VIEW_INVOICES', 'CREATE_INVOICES', 'MANAGE_PAYMENTS',
    'SEND_WHATSAPP',
    'VIEW_SCHEDULE', 'MANAGE_SCHEDULE',
  ],
  InventoryManager: [
    'VIEW_INVENTORY', 'MANAGE_INVENTORY',
    'VIEW_INVOICES',
    'VIEW_PATIENTS',
  ],
};

async function main() {
  console.log('Seeding permissions...');
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {},
      create: perm,
    });
  }

  console.log('Seeding roles...');
  for (const role of ROLES) {
    const createdRole = await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });

    const permCodes = DEFAULT_ROLE_PERMISSIONS[role.name] || [];
    for (const code of permCodes) {
      const perm = await prisma.permission.findUnique({ where: { code } });
      if (!perm) continue;

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: createdRole.id,
            permissionId: perm.id,
          },
        },
        update: {},
        create: {
          roleId: createdRole.id,
          permissionId: perm.id,
        },
      });
    }
  }

  // Seed service catalog for demo clinic (if one exists)
  const demoClinic = await prisma.clinic.findFirst();
  if (demoClinic) {
    const serviceCatalogCount = await seedServiceCatalog(prisma, demoClinic.id);
    console.log(`Seeded ${serviceCatalogCount} service catalog entries for clinic: ${demoClinic.name}`);
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
