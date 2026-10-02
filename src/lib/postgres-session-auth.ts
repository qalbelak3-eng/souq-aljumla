import { eq, or } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { authIdentities, staffProfiles } from '@/db/schema';
import { hashPassword, verifyPassword } from '@/lib/password';

export interface PgSessionStaff {
  id: string;
  authIdentityId: string;
  name: string;
  username: string;
  jobTitle: string;
  role: string;
  permissions: string[];
  isActive: boolean;
}

function normalizeUsername(value?: string): string {
  return (value || '').trim().toLowerCase();
}

export async function pgGetActiveStaffForSession(params: { userId?: string; username?: string }): Promise<PgSessionStaff | null> {
  const userId = (params.userId || '').trim();
  const username = normalizeUsername(params.username);
  if (!userId && !username) return null;
  const db = getDb();
  const rows = await db.select({
    id: staffProfiles.id, authIdentityId: staffProfiles.authIdentityId, name: staffProfiles.name,
    username: staffProfiles.username, jobTitle: staffProfiles.jobTitle, role: staffProfiles.role,
    permissions: staffProfiles.permissions, isActive: authIdentities.isActive,
  }).from(staffProfiles).innerJoin(authIdentities, eq(staffProfiles.authIdentityId, authIdentities.id)).where(
    username && userId
      ? or(eq(staffProfiles.username, username), eq(staffProfiles.id, userId), eq(authIdentities.id, userId))
      : username ? eq(staffProfiles.username, username) : or(eq(staffProfiles.id, userId), eq(authIdentities.id, userId)),
  ).limit(1);
  const row = rows[0];
  if (!row || !row.isActive) return null;
  return { ...row, permissions: row.permissions || [], isActive: true };
}

export async function pgAuthenticateAdminOrStaff(usernameInput: string, password: string): Promise<PgSessionStaff | null> {
  const username = normalizeUsername(usernameInput);
  if (!username || !password) return null;
  const db = getDb();
  const rows = await db.select({
    id: staffProfiles.id, authIdentityId: staffProfiles.authIdentityId, name: staffProfiles.name,
    username: staffProfiles.username, jobTitle: staffProfiles.jobTitle, role: staffProfiles.role,
    permissions: staffProfiles.permissions, isActive: authIdentities.isActive, passwordHash: authIdentities.passwordHash,
  }).from(staffProfiles).innerJoin(authIdentities, eq(staffProfiles.authIdentityId, authIdentities.id))
    .where(eq(staffProfiles.username, username)).limit(1);
  const row = rows[0];
  if (!row || !row.isActive || !row.passwordHash || !verifyPassword(password, row.passwordHash)) return null;
  await db.update(authIdentities).set({ lastLoginAt: new Date() }).where(eq(authIdentities.id, row.authIdentityId));
  return { id: row.id, authIdentityId: row.authIdentityId, name: row.name, username: row.username, jobTitle: row.jobTitle, role: row.role, permissions: row.permissions || [], isActive: true };
}

export async function pgUpdateStaffPassword(params: { staffId?: string; username?: string; currentPassword: string; newPassword: string }): Promise<boolean> {
  const staffId = (params.staffId || '').trim();
  const username = normalizeUsername(params.username);
  if ((!staffId && !username) || !params.currentPassword || !params.newPassword) return false;
  const db = getDb();
  const rows = await db.select({
    staffId: staffProfiles.id, username: staffProfiles.username, authIdentityId: staffProfiles.authIdentityId,
    isActive: authIdentities.isActive, passwordHash: authIdentities.passwordHash,
  }).from(staffProfiles).innerJoin(authIdentities, eq(staffProfiles.authIdentityId, authIdentities.id)).where(
    staffId && username ? or(eq(staffProfiles.id, staffId), eq(staffProfiles.username, username))
      : staffId ? eq(staffProfiles.id, staffId) : eq(staffProfiles.username, username),
  ).limit(1);
  const row = rows[0];
  if (!row || !row.isActive || !row.passwordHash || !verifyPassword(params.currentPassword, row.passwordHash)) return false;
  await db.update(authIdentities).set({ passwordHash: hashPassword(params.newPassword) }).where(eq(authIdentities.id, row.authIdentityId));
  return true;
}
