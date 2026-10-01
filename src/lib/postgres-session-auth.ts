import { eq, or } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { authIdentities, staffProfiles } from '@/db/schema';

export interface PgSessionStaff {
  id: string;
  authIdentityId: string;
  name: string;
  username: string;
  jobTitle: string;
  permissions: string[];
  isActive: boolean;
}

/**
 * Server-side lookup used after a signed admin/staff session has been verified.
 * The cookie alone is never authoritative: the PostgreSQL identity must still be active.
 */
export async function pgGetActiveStaffForSession(params: {
  userId?: string;
  username?: string;
}): Promise<PgSessionStaff | null> {
  const userId = (params.userId || '').trim();
  const username = (params.username || '').trim();
  if (!userId && !username) return null;

  const db = getDb();
  const rows = await db
    .select({
      id: staffProfiles.id,
      authIdentityId: staffProfiles.authIdentityId,
      name: staffProfiles.name,
      username: staffProfiles.username,
      jobTitle: staffProfiles.jobTitle,
      permissions: staffProfiles.permissions,
      isActive: authIdentities.isActive,
    })
    .from(staffProfiles)
    .innerJoin(authIdentities, eq(staffProfiles.authIdentityId, authIdentities.id))
    .where(
      username && userId
        ? or(
            eq(staffProfiles.username, username),
            eq(staffProfiles.id, userId),
            eq(authIdentities.id, userId),
          )
        : username
          ? eq(staffProfiles.username, username)
          : or(eq(staffProfiles.id, userId), eq(authIdentities.id, userId)),
    )
    .limit(1);

  const row = rows[0];
  if (!row || !row.isActive) return null;

  return {
    id: row.id,
    authIdentityId: row.authIdentityId,
    name: row.name,
    username: row.username,
    jobTitle: row.jobTitle,
    permissions: row.permissions || [],
    isActive: true,
  };
}
