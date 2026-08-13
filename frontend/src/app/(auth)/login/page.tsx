import { AuthPage } from '../../../components/auth/auth-page';

export default async function LoginRoute({
  searchParams
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <AuthPage mode="login" nextPath={resolvedSearchParams?.next ?? '/dashboard'} />;
}
