export interface User {
  id: string;
  email: string;
  phone: string;
  fullName: string;
  licenseNumber: string | null;
  specialization: string | null;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Clinic {
  id: string;
  name: string;
  address: string;
  contactPhone: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClinicMember {
  id: string;
  userId: string;
  clinicId: string;
  isActive: boolean;
  createdAt: Date;
  roles: RoleName[];
}

export interface ClinicMemberRole {
  id: string;
  clinicMemberId: string;
  roleId: string;
  createdAt: Date;
}

export type RoleName = 'Admin' | 'Clinician' | 'FrontDesk' | 'InventoryManager';

export interface Role {
  id: string;
  name: RoleName;
  description: string;
}

export interface Permission {
  id: string;
  code: string;
  description: string;
  module: string;
}

export interface TokenPayload {
  sub: string;
  clinicId: string;
  type: 'access' | 'refresh';
}

export interface RefreshTokenPayload extends TokenPayload {
  familyId: string;
  tokenId: string;
}
