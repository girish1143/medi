import { APP_ROLES } from '../types/domain.js';
import type { ModuleBoundarySpec } from './boundaryFactory.js';

const ALL_ACTIVE_ROLES = [...APP_ROLES];

/**
 * Authoritative Phase 1 API module boundaries and RBAC role assignments.
 */
export const MODULE_BOUNDARIES: ModuleBoundarySpec[] = [
  {
    moduleName: 'auth',
    basePath: '/api/v1/auth',
    endpoints: [
      {
        method: 'get',
        path: '/me',
        allowedRoles: ALL_ACTIVE_ROLES,
        description: 'GET /api/v1/auth/me',
      },
    ],
  },
  {
    moduleName: 'users',
    basePath: '/api/v1/admin',
    endpoints: [
      {
        method: 'get',
        path: '/users',
        allowedRoles: ['super_admin', 'operations_admin', 'support_admin'],
        description: 'GET /api/v1/admin/users',
      },
      {
        method: 'post',
        path: '/roles',
        allowedRoles: ['super_admin'],
        description: 'POST /api/v1/admin/roles',
      },
      {
        method: 'post',
        path: '/roles/:id/revoke',
        allowedRoles: ['super_admin'],
        description: 'POST /api/v1/admin/roles/:id/revoke',
      },
    ],
  },
  {
    moduleName: 'patients',
    basePath: '/api/v1/patients',
    endpoints: [
      {
        method: 'get',
        path: '/me',
        allowedRoles: ['patient'],
        description: 'GET /api/v1/patients/me',
      },
      {
        method: 'patch',
        path: '/me',
        allowedRoles: ['patient'],
        description: 'PATCH /api/v1/patients/me',
      },
    ],
  },
  {
    moduleName: 'providers',
    basePath: '/api/v1/providers',
    endpoints: [
      {
        method: 'get',
        path: '/specializations',
        allowedRoles: ALL_ACTIVE_ROLES,
        description: 'GET /api/v1/providers/specializations',
      },
      {
        method: 'post',
        path: '/verify/:type/:id',
        allowedRoles: ['super_admin', 'operations_admin'],
        description: 'POST /api/v1/providers/verify/:type/:id',
      },
    ],
  },
  {
    moduleName: 'consents',
    basePath: '/api/v1/consents',
    endpoints: [
      {
        method: 'get',
        path: '/me',
        allowedRoles: ['patient'],
        description: 'GET /api/v1/consents/me',
      },
      {
        method: 'post',
        path: '/',
        allowedRoles: ['patient'],
        description: 'POST /api/v1/consents',
      },
      {
        method: 'post',
        path: '/:id/withdraw',
        allowedRoles: ['patient'],
        description: 'POST /api/v1/consents/:id/withdraw',
      },
    ],
  },
  {
    moduleName: 'leads',
    basePath: '/api/v1/leads',
    endpoints: [
      {
        method: 'post',
        path: '/',
        allowedRoles: ['patient'],
        description: 'POST /api/v1/leads',
      },
      {
        method: 'get',
        path: '/me',
        allowedRoles: ['patient'],
        description: 'GET /api/v1/leads/me',
      },
      {
        method: 'get',
        path: '/:id',
        allowedRoles: ['patient', 'doctor', 'hospital', 'operations_admin', 'super_admin'],
        description: 'GET /api/v1/leads/:id',
      },
      {
        method: 'post',
        path: '/:id/qualify',
        allowedRoles: ['operations_admin', 'super_admin'],
        description: 'POST /api/v1/leads/:id/qualify',
      },
    ],
  },
  {
    moduleName: 'matching',
    basePath: '/api/v1/matching',
    endpoints: [
      {
        method: 'post',
        path: '/leads/:id/assign',
        allowedRoles: ['operations_admin', 'super_admin'],
        description: 'POST /api/v1/matching/leads/:id/assign',
      },
      {
        method: 'get',
        path: '/assignments/me',
        allowedRoles: ['doctor', 'hospital'],
        description: 'GET /api/v1/matching/assignments/me',
      },
      {
        method: 'post',
        path: '/assignments/:id/respond',
        allowedRoles: ['doctor', 'hospital'],
        description: 'POST /api/v1/matching/assignments/:id/respond',
      },
    ],
  },
  {
    moduleName: 'billing',
    basePath: '/api/v1/billing',
    endpoints: [
      {
        method: 'get',
        path: '/plans',
        allowedRoles: ['doctor', 'hospital', 'finance_admin', 'super_admin'],
        description: 'GET /api/v1/billing/plans',
      },
      {
        method: 'post',
        path: '/plans',
        allowedRoles: ['finance_admin', 'super_admin'],
        description: 'POST /api/v1/billing/plans',
      },
      {
        method: 'get',
        path: '/invoices',
        allowedRoles: ['doctor', 'hospital', 'finance_admin', 'super_admin'],
        description: 'GET /api/v1/billing/invoices',
      },
    ],
  },
  {
    moduleName: 'notifications',
    basePath: '/api/v1/notifications',
    endpoints: [
      {
        method: 'get',
        path: '/me',
        allowedRoles: ALL_ACTIVE_ROLES,
        description: 'GET /api/v1/notifications/me',
      },
    ],
  },
  {
    moduleName: 'support',
    basePath: '/api/v1/support',
    endpoints: [
      {
        method: 'get',
        path: '/tickets',
        allowedRoles: ALL_ACTIVE_ROLES,
        description: 'GET /api/v1/support/tickets',
      },
      {
        method: 'post',
        path: '/tickets',
        allowedRoles: ALL_ACTIVE_ROLES,
        description: 'POST /api/v1/support/tickets',
      },
    ],
  },
  {
    moduleName: 'audit',
    basePath: '/api/v1/audit',
    endpoints: [
      {
        method: 'get',
        path: '/logs',
        allowedRoles: ['super_admin'],
        description: 'GET /api/v1/audit/logs',
      },
    ],
  },
];
