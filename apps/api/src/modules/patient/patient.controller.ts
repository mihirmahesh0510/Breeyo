import type { FastifyRequest, FastifyReply } from 'fastify';
import type { PatientService } from './patient.service.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import {
  ownerRegistrationSchema,
  petRegistrationSchema,
} from '@breeyo/validators';
import {
  registerPatientBodySchema,
  mobileLookupQuerySchema,
  searchQuerySchema,
  recentQuerySchema,
  ownerParamsSchema,
  petParamsSchema,
  updatePetBodySchema,
} from './patient.schema.js';

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((i) => i.message).join(', '),
    },
  });
}

/**
 * D-30: takes a factory rather than a prebuilt service, so every handler
 * resolves its Prisma handle from `request.db` (the tenant-scoped, RLS-bound
 * client) instead of sharing a plugin-scope admin client across all clinics.
 */
export function createPatientController(
  buildService: (db: TenantPrismaClient) => PatientService,
) {
  return {
    async registerOwnerHandler(request: FastifyRequest, reply: FastifyReply) {
      const patientService = buildService(request.db);

      const result = ownerRegistrationSchema.safeParse(request.body);
      if (!result.success) {
        return validationError(reply, result.error.errors);
      }

      const owner = await patientService.registerOwner({
        clinicId: request.user.activeClinicId,
        ...result.data,
      });

      return reply.status(201).send({ data: owner });
    },

    async registerPetHandler(request: FastifyRequest, reply: FastifyReply) {
      const patientService = buildService(request.db);

      const params = ownerParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = petRegistrationSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const pet = await patientService.registerPet({
        clinicId: request.user.activeClinicId,
        ownerId: params.data.ownerId,
        ...body.data,
      });

      return reply.status(201).send({ data: pet });
    },

    async registerPatientHandler(request: FastifyRequest, reply: FastifyReply) {
      const patientService = buildService(request.db);

      const result = registerPatientBodySchema.safeParse(request.body);
      if (!result.success) {
        return validationError(reply, result.error.errors);
      }

      const patient = await patientService.registerPatient({
        clinicId: request.user.activeClinicId,
        owner: result.data.owner,
        pet: result.data.pet,
      });

      return reply.status(201).send({ data: patient });
    },

    async lookupByMobileHandler(request: FastifyRequest, reply: FastifyReply) {
      const patientService = buildService(request.db);

      const query = mobileLookupQuerySchema.safeParse(request.query);
      if (!query.success) {
        return validationError(reply, query.error.errors);
      }

      const owner = await patientService.lookupByMobile(
        request.user.activeClinicId,
        query.data.mobile,
      );

      if (!owner) {
        return reply.status(404).send({
          error: { code: 'OWNER_NOT_FOUND', message: 'No owner found with this mobile number' },
        });
      }

      return reply.status(200).send({ data: owner });
    },

    async getOwnerDetailHandler(request: FastifyRequest, reply: FastifyReply) {
      const patientService = buildService(request.db);

      const params = ownerParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const owner = await patientService.getOwnerWithPets(
        request.user.activeClinicId,
        params.data.ownerId,
      );

      if (!owner) {
        return reply.status(404).send({
          error: { code: 'OWNER_NOT_FOUND', message: 'Owner not found' },
        });
      }

      return reply.status(200).send({ data: owner });
    },

    async searchPatientsHandler(request: FastifyRequest, reply: FastifyReply) {
      const patientService = buildService(request.db);

      const query = searchQuerySchema.safeParse(request.query);
      if (!query.success) {
        return validationError(reply, query.error.errors);
      }

      const results = await patientService.searchPatients({
        clinicId: request.user.activeClinicId,
        query: query.data.q,
        limit: query.data.limit,
      });

      return reply.status(200).send({ data: results });
    },

    async getRecentPatientsHandler(request: FastifyRequest, reply: FastifyReply) {
      const patientService = buildService(request.db);

      const query = recentQuerySchema.safeParse(request.query);
      if (!query.success) {
        return validationError(reply, query.error.errors);
      }

      const results = await patientService.getRecentPatients(
        request.user.activeClinicId,
        query.data.limit,
      );

      return reply.status(200).send({ data: results });
    },

    async getPetProfileHandler(request: FastifyRequest, reply: FastifyReply) {
      const patientService = buildService(request.db);

      const params = petParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const profile = await patientService.getPetProfile({
        clinicId: request.user.activeClinicId,
        petId: params.data.petId,
      });

      if (!profile) {
        return reply.status(404).send({
          error: { code: 'PET_NOT_FOUND', message: 'Pet not found' },
        });
      }

      return reply.status(200).send({ data: profile });
    },

    async updatePetHandler(request: FastifyRequest, reply: FastifyReply) {
      const patientService = buildService(request.db);

      const params = petParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = updatePetBodySchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const pet = await patientService.updatePet({
        clinicId: request.user.activeClinicId,
        petId: params.data.petId,
        data: body.data,
      });

      return reply.status(200).send({ data: pet });
    },
  };
}
