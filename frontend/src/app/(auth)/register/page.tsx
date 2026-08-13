import { AuthPage } from '../../../components/auth/auth-page';

export default async function RegisterRoute({
  searchParams
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <AuthPage mode="register" nextPath={resolvedSearchParams?.next ?? '/dashboard'} />;
}
