import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ScreenState } from '@/components/ScreenState'
import { MESSAGES, userFacingError } from '@/lib/errors'
import { invokeBc } from '@/lib/integration-api'

export function BcOAuthCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const oauthError = params.get('error_description') || params.get('error')
    const code = params.get('code')
    const state = params.get('state')
    window.history.replaceState(null, '', '/company/integrations/business-central/oauth-callback')
    if (oauthError) {
      setError(userFacingError(oauthError, MESSAGES.bcConnect))
      return
    }
    if (!code || !state) {
      setError('Invalid OAuth callback.')
      return
    }
    void invokeBc({ action: 'oauth_callback', code, state }).then((result) => {
      if (result.error) {
        setError(userFacingError(result.error, MESSAGES.bcConnect))
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
