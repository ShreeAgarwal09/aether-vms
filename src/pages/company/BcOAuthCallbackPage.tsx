import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ScreenState } from '@/components/ScreenState'
import { invokeBc } from '@/lib/integration-api'

export function BcOAuthCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const oauthError = params.get('error_description') || params.get('error')
    const code = params.get('code')
    const state = params.get('state')
    if (oauthError) {
      setError(oauthError)
      return
    }
    if (!code || !state) {
      setError('Invalid OAuth callback.')
      return
    }
    void invokeBc({ action: 'oauth_callback', code, state }).then((result) => {
      if (result.error) {
        setError(String(result.error))
        return
      }
      navigate('/company/integrations/business-central', { replace: true })
    })
  }, [params, navigate])

  if (error) {
    return (
      <ScreenState
        title="Business Central connection failed"
        body={error}
      />
    )
  }
  return <ScreenState title="Completing connection" body="Exchanging the authorization code on the server. Tokens are not stored in the browser." loading />
}
