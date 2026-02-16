/**
 * Declaracoes de tipos para o Facebook JavaScript SDK
 * Usado pelo Embedded Signup (Cadastro Incorporado) com Coexistencia
 */

interface FBInitParams {
  appId: string
  cookie?: boolean
  xfbml?: boolean
  version: string
}

interface FBLoginOptions {
  config_id?: string
  response_type?: string
  override_default_response_type?: boolean
  scope?: string
  extras?: {
    setup?: Record<string, unknown>
    featureType?: string
    sessionInfoVersion?: string
    sessionInfoNonce?: string
  }
}

interface FBAuthResponse {
  accessToken?: string
  code?: string
  userID?: string
  expiresIn?: number
  signedRequest?: string
}

interface FBLoginResponse {
  status: 'connected' | 'not_authorized' | 'unknown'
  authResponse: FBAuthResponse | null
}

interface FBSessionInfoEvent {
  data: {
    waba_id?: string
    phone_number_id?: string
  }
  type: 'WA_EMBEDDED_SIGNUP'
  event: string
  version: number
}

interface FB {
  init(params: FBInitParams): void
  login(callback: (response: FBLoginResponse) => void, options?: FBLoginOptions): void
  getLoginStatus(callback: (response: FBLoginResponse) => void): void
  Event: {
    subscribe(event: string, callback: (...args: unknown[]) => void): void
    unsubscribe(event: string, callback: (...args: unknown[]) => void): void
  }
}

interface Window {
  FB?: FB
  fbAsyncInit?: () => void
}
