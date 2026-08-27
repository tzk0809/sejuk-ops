'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase/server';
import { SESSION_COOKIE, homePathFor } from '@/lib/session';
import type { User } from '@/lib/types';

/**
 * Role switcher. Writes the chosen user id to the session cookie.
 *
 * The id is checked against the database before being stored: without that, any
 * string could be written into the cookie and every page would then send it to
 * Postgres as a uuid. Validating at the point of entry keeps the rest of the app
 * able to assume the cookie names a real, active user.
 */
export async function switchUser(userId: string, goHome = false) {
  const { data } = await db
    .from('users')
    .select('*')
    .eq('id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (!data) throw new Error('Unknown or deactivated user.');
  const user = data as User;

  const jar = await cookies();
  jar.set(SESSION_COOKIE, user.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  // Every page reads the acting user, so all of them are now stale.
  revalidatePath('/', 'layout');

  if (goHome) redirect(homePathFor(user.role));
}

/** Clears the session, sending the visitor back to the picker. */
export async function signOut() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  revalidatePath('/', 'layout');
  redirect('/switch-role');
}
