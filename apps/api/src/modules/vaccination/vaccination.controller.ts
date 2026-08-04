import type { FastifyRequest, FastifyReply } from 'fastify';
import type { VaccinationService } from './vaccination.service.js';

export class VaccinationController {
  constructor(private readonly service: VaccinationService) {}

  addVaccination = async (request: FastifyRequest, reply: FastifyReply) => {
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
      petSpecies: string;
      petAgeDays: number;
    };

    if (!body.vaccineName) {
      return reply.status(400).send({ error: 'vaccineName is required' });
    }

    const result = await this.service.createVaccination(
      clinicId,
      petId,
      body.consultationId ?? null,
      body.petSpecies,
      body.petAgeDays,
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
    const { petId } = request.params as { petId: string };
    const clinicId = request.user.activeClinicId;

    const records = await this.service.getVaccinationHistory(clinicId, petId);
    return reply.send({ data: records });
  };

  addDeworming = async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };
    const clinicId = request.user.activeClinicId;
    const vetId = request.user.id;
    const body = request.body as {
      drugName: string;
      consultationId?: string;
      nextDueDate?: string;
      petSpecies: string;
      petAgeDays: number;
    };

    if (!body.drugName) {
      return reply.status(400).send({ error: 'drugName is required' });
    }

    const result = await this.service.createDeworming(
      clinicId,
      petId,
      body.consultationId ?? null,
      body.petSpecies,
      body.petAgeDays,
      {
        drugName: body.drugName,
        administeredBy: vetId,
        nextDueDate: body.nextDueDate ? new Date(body.nextDueDate) : undefined,
      },
    );

    return reply.status(201).send(result);
  };

  getDewormingHistory = async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };
    const clinicId = request.user.activeClinicId;

    const records = await this.service.getDewormingHistory(clinicId, petId);
    return reply.send({ data: records });
  };

  getPreventiveCareStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };
    const clinicId = request.user.activeClinicId;

    const status = await this.service.getPreventiveCareStatus(clinicId, petId);
    return reply.send(status);
  };

  getCertificateData = async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId, vaccinationId } = request.params as { petId: string; vaccinationId: string };
    const clinicId = request.user.activeClinicId;

    const data = await this.service.getCertificateData(clinicId, petId, vaccinationId);
    return reply.send(data);
  };
}
