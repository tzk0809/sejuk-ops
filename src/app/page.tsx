import { redirect } from 'next/navigation';
import { getCurrentUser, landingPathFor } from '@/lib/session';

/** Sends each visitor to the view that matches their role, or to pick one. */
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? landingPathFor(user.role) : '/switch-role');
}
