import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/supabase/server';
import type { User, UserRole } from '@/lib/types';

// Mock identity. There is no authentication: the "session" is a cookie holding
// the id of a seeded user, chosen on /switch-role.
//
// Why a cookie and not localStorage or React state: every query in this app runs
// on the server, so the server has to know who the caller claims to be on every
// request. A cookie is sent automatically with each one; browser-only storage is
// invisible to a server component. This also keeps identity in ONE place instead
// of passing user_id through every call site.
//
// LIMITATION, stated plainly: the client chooses this value, so the app knows who
// you SAY you are, not who you ARE. The role checks in 0004_role_checks.sql
// validate that the claimed user holds the required role — they catch bugs, not
// attackers. With real auth this cookie becomes a signed session and the same
// checks become a genuine authorization boundary.

const COOKIE_NAME = 'sejuk_user_id';

export const SESSION_COOKIE = COOKIE_NAME;

/** Every seeded user, for the switcher. Active only — deactivated staff cannot act. */
export async function listUsers(): Promise<User[]> {
  const { data, error } = await db
    .from('users')
    .select('*')
    .eq('is_active', true)
    .order('role')
    .order('name');
  if (error) throw new Error(`Failed to load users: ${error.message}`);
  return data as User[];
}

/**
 * The acting user, or null when nobody has been chosen.
 *
 * Deliberately does NOT fall back to an admin. An expired or deleted cookie
 * silently promoting someone to admin is the worst possible default, even in a
 * mock: it is the one failure mode that grants MORE access than intended.
 * Callers get null and send the visitor to /switch-role instead.
 */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE_NAME)?.value;
  if (!id) return null;

  const { data } = await db
    .from('users')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle();

  return (data as User) ?? null;
}

/** For pages that cannot render without an identity. Redirects if there is none. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/switch-role');
  return user;
}

/**
 * Where each role belongs after signing in.
 *
 * Two routes rather than one that changes shape: the spec has admins at desks
 * and technicians on phones in the field, and Module 2 asks for a mobile-first
 * technician interface optimised for speed. Each page guards itself as well, so
 * this is convenience — the redirect is not the security boundary.
 */
export function homePathFor(role: UserRole): string {
  return role === 'technician' ? '/jobs' : '/orders';
}
