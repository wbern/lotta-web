import { getActiveDataProvider } from './active-provider'

interface RedeemClubCodeResult {
  status: 'ok' | 'error'
  clubs?: string[]
  reason?: string
}

interface AuthCapableProvider {
  auth?: {
    redeemClubCode(code: string): Promise<RedeemClubCodeResult>
  }
}

export async function redeemClubCode(code: string): Promise<RedeemClubCodeResult> {
  const provider = getActiveDataProvider() as AuthCapableProvider | null
  if (!provider || !provider.auth) {
    return { status: 'error', reason: 'no-provider' }
  }
  return provider.auth.redeemClubCode(code)
}
