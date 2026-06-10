import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { LoginContent } from './login-content'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const session = await auth()
  if (session) redirect('/')

  const { callbackUrl } = await searchParams
  return <LoginContent callbackUrl={callbackUrl ?? '/'} />
}
