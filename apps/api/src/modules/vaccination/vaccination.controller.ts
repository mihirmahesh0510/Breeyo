import type { FastifyRequest, FastifyReply } from 'fastify';
import type { VaccinationService } from './vaccination.service.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';

/**
 * D-30: holds a factory rather than a prebuilt service, so every handler
 * resolves its Prisma handle from `request.db` (the tenant-scoped, RLS-bound
 * client) instead of sharing a plugin-scope admin client across all clinics.
 */
export class VaccinationController {
  constructor(
    private readonly buildService: (db: TenantPrismaClient) => VaccinationService,
  ) {}

  addVaccination = async (request: FastifyRequest, reply: FastifyReply) => {
    const service = this.buildService(request.db);

    const { petId } = request.params as { petId: string };
    const clinicId = request.user.activeClinicId;
    const vetId = request.user.id;
    const body = request.body as {
      vaccineName: string;
      batchNumber?: string;
      manufacturer?: string;
      expiryDate?: string;
      consultationId?: string;
      nextDueDate?: string;
    };

    if (!body.vaccineName) {
      return reply.status(400).send({ error: 'vaccineName is required' });
    }

    const result = await service.createVaccination(
      clinicId,
      petId,
      body.consultationId ?? null,
      {
        vaccineName: body.vaccineName,
        batchNumber: body.batchNumber,
        manufacturer: body.manufacturer,
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
        administeredBy: vetId,
        nextDueDate: body.nextDueDate ? new Date(body.nextDueDate) : undefined,
      },
    );

    return reply.status(201).send(result);
  };

  getVaccinationHistory = async (request: FastifyRequest, reply: FastifyReply) => {
    const service = this.buildService(request.db);

    const { petId } = request.params as { petId: string };
    const clinicId = request.user.activeClinicId;

    const records = await service.getVaccinationHistory(clinicId, petId);
    return reply.send({ data: records });
  };

  addDeworming = async (request: FastifyRequest, reply: FastifyReply) => {
    const service = this.buildService(request.db);

    const { petId } = request.params as { petId: string };
    const clinicId = request.user.activeClinicId;
    const vetId = request.user.id;
    const body = request.body as {
      drugName: string;
      consultationId?: string;
      nextDueDate?: string;
    };

    if (!body.drugName) {
      return reply.status(400).send({ error: 'drugName is required' });
    }

    const result = await service.createDeworming(
      clinicId,
      petId,
      body.consultationId ?? null,
      {
        drugName: body.drugName,
        administeredBy: vetId,
        nextDueDate: body.nextDueDate ? new Date(body.nextDueDate) : undefined,
      },
    );

    return reply.status(201).send(result);
  };

  getDewormingHistory = async (request: FastifyRequest, reply: FastifyReply) => {
    const service = this.buildService(request.db);

    const { petId } = request.params as { petId: string };
    const clinicId = request.user.activeClinicId;

    const records = await service.getDewormingHistory(clinicId, petId);
    return reply.send({ data: records });
  };

  getPreventiveCareStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    const service = this.buildService(request.db);

    const { petId } = request.params as { petId: string };
    const clinicId = request.user.activeClinicId;

    const status = await service.getPreventiveCareStatus(clinicId, petId);
    return reply.send(status);
  };

  getCertificateData = async (request: FastifyRequest, reply: FastifyReply) => {
    const service = this.buildService(request.db);

    const { petId, vaccinationId } = request.params as { petId: string; vaccinationId: string };
    const clinicId = request.user.activeClinicId;

    const data = await service.getCertificateData(clinicId, petId, vaccinationId);
    return reply.send(data);
  };
}
