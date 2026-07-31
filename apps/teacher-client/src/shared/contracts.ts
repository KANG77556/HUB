import { z } from 'zod';

export const loginInputSchema = z.object({
  schoolCode: z.string().min(2).max(30),
  username: z.string().min(3).max(80),
  password: z.string().min(1).max(256),
});

export const sessionViewSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string().min(1).max(100),
  schoolName: z.string().min(1).max(200),
  departmentNames: z.array(z.string().min(1).max(100)),
  roles: z.array(z.string().min(1)),
  permissions: z.array(z.string().min(1)),
});
export type SessionView = z.infer<typeof sessionViewSchema>;

export const connectionStateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('online'), lastSyncAt: z.string().min(1) }),
  z.object({ kind: z.literal('offline-readonly'), lastSyncAt: z.string().min(1).nullable() }),
  z.object({ kind: z.literal('reconnecting'), lastSyncAt: z.string().min(1).nullable() }),
  z.object({
    kind: z.literal('security-blocked'),
    code: z.enum(['CERTIFICATE_MISMATCH', 'SERVER_IDENTITY_INVALID']),
  }),
]);
export type ConnectionState = z.infer<typeof connectionStateSchema>;

const dashboardItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  updatedAt: z.string().min(1),
});

export const dashboardSnapshotSchema = z.object({
  generatedAt: z.string().min(1),
  metrics: z.array(z.object({ key: z.string(), count: z.number().int().nonnegative() })),
  scheduleItems: z.array(dashboardItemSchema),
  documentItems: z.array(dashboardItemSchema),
});
export type DashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>;

export const syncSummarySchema = z.object({
  newScheduleCount: z.number().int().nonnegative(),
  changedScheduleCount: z.number().int().nonnegative(),
  newDocumentCount: z.number().int().nonnegative(),
  changedSubmissionCount: z.number().int().nonnegative(),
});
export type SyncSummary = z.infer<typeof syncSummarySchema>;

export const tokenPairResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(32).max(512),
  token_type: z.literal('bearer'),
  expires_in_seconds: z.number().int().positive(),
  refresh_expires_in_seconds: z.number().int().positive(),
});
export type TokenPairResponse = z.infer<typeof tokenPairResponseSchema>;

export const currentUserResponseSchema = z.object({
  id: z.string().uuid(),
  school_id: z.string().uuid(),
  school_name: z.string().min(1),
  department_id: z.string().uuid().nullable(),
  department_names: z.array(z.string()),
  username: z.string(),
  display_name: z.string(),
  is_superuser: z.boolean(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});
export type CurrentUserResponse = z.infer<typeof currentUserResponseSchema>;

export const serverIdentityResponseSchema = z.object({
  service: z.literal('schoolworkhub'),
  api_version: z.literal('v1'),
  school_code: z.string().nullable(),
  school_name: z.string().nullable(),
});
export type ServerIdentityResponse = z.infer<typeof serverIdentityResponseSchema>;

export const dashboardResponseSchema = z.object({
  generated_at: z.string().min(1),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  metrics: z.array(z.object({ key: z.string(), count: z.number().int().nonnegative() })),
  schedule_items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.string(),
      updated_at: z.string().min(1),
    }),
  ),
  document_items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.string(),
      updated_at: z.string().min(1),
    }),
  ),
});
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;

export const serverChangeInputSchema = z.object({
  baseUrl: z.string().url(),
  schoolCode: z.string().min(2).max(30),
  currentFingerprint: z.string().regex(/^[A-F0-9]{64}$/),
  nextFingerprint: z.string().regex(/^[A-F0-9]{64}$/).nullable(),
  adminUsername: z.string().min(3).max(80),
  adminPassword: z.string().min(1).max(256),
});

export type LoginInput = z.infer<typeof loginInputSchema>;
export type ServerChangeInput = z.infer<typeof serverChangeInputSchema>;
