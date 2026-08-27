import { redirect } from 'next/navigation';
import { getCurrentUser, homePathFor } from '@/lib/session';

/** Sends each visitor to the view that matches their role, or to pick one. */
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? homePathFor(user.role) : '/switch-role');
}
