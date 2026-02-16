'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

// ============================================================================
// Tipos
// ============================================================================

type SignupStep =
  | 'idle'
  | 'loading_sdk'
  | 'ready'
  | 'waiting_popup'
  | 'exchanging_token'
  | 'syncing_contacts'
  | 'syncing_history'
  | 'done'
  | 'error'

interface EmbeddedSignupButtonProps {
  /** Meta App ID (vindo do settings) */
  appId: string | null
  /** Callback chamado quando signup + salvamento concluir */
  onSuccess: () => void
  /** Classe CSS extra */
  className?: string
  /** Modo compacto (para quando ja esta conectado) */
  compact?: boolean
}

const CONFIG_ID = process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID || ''

const STEP_LABELS: Record<SignupStep, string> = {
  idle: 'Conectar via Facebook',
  loading_sdk: 'Carregando...',
  ready: 'Conectar via Facebook',
  waiting_popup: 'Aguardando...',
  exchanging_token: 'Conectando...',
  syncing_contacts: 'Sincronizando contatos...',
  syncing_history: 'Sincronizando histórico...',
  done: 'Conectado!',
  error: 'Tentar novamente',
}

// ============================================================================
// Facebook SDK Loader
// ============================================================================

let sdkLoadPromise: Promise<void> | null = null

function loadFacebookSDK(appId: string): Promise<void> {
  if (sdkLoadPromise) return sdkLoadPromise

  sdkLoadPromise = new Promise((resolve, reject) => {
    if (window.FB) {
      window.FB.init({ appId, cookie: true, xfbml: true, version: 'v24.0' })
      resolve()
      return
    }

    window.fbAsyncInit = () => {
      window.FB!.init({ appId, cookie: true, xfbml: true, version: 'v24.0' })
      resolve()
    }

    // Carrega o SDK se ainda nao foi carregado
    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script')
      script.id = 'facebook-jssdk'
      script.src = 'https://connect.facebook.net/pt_BR/sdk.js'
      script.async = true
      script.defer = true
      script.onerror = () => {
        sdkLoadPromise = null
        reject(new Error('Falha ao carregar Facebook SDK'))
      }
      document.body.appendChild(script)
    }
  })

  return sdkLoadPromise
}

// ============================================================================
// Componente
// ============================================================================

export const EmbeddedSignupButton: React.FC<EmbeddedSignupButtonProps> = ({
  appId,
  onSuccess,
  className = '',
  compact = false,
}) => {
  const [step, setStep] = useState<SignupStep>('idle')
  const sessionDataRef = useRef<{ waba_id?: string; phone_number_id?: string }>({})
  const listenerRef = useRef<((...args: unknown[]) => void) | null>(null)

  // Carrega SDK quando appId esta disponivel
  useEffect(() => {
    if (!appId || !CONFIG_ID) return

    setStep('loading_sdk')
    loadFacebookSDK(appId)
      .then(() => setStep('ready'))
      .catch(() => {
        setStep('error')
        toast.error('Falha ao carregar Facebook SDK')
      })

    return () => {
      // Limpa listener ao desmontar
      if (listenerRef.current && window.FB) {
        window.FB.Event.unsubscribe('auth.statusChange', listenerRef.current)
        listenerRef.current = null
      }
    }
  }, [appId])

  // Handler do sessionInfoListener
  const registerSessionListener = useCallback(() => {
    if (!window.FB || listenerRef.current) return

    const listener = (...args: unknown[]) => {
      const event = args[0] as FBSessionInfoEvent | undefined
      if (!event || event.type !== 'WA_EMBEDDED_SIGNUP') return

      if (event.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' || event.event === 'FINISH') {
        sessionDataRef.current = {
          waba_id: event.data?.waba_id,
          phone_number_id: event.data?.phone_number_id,
        }
      }
    }

    window.FB.Event.subscribe('auth.statusChange', listener)
    listenerRef.current = listener
  }, [])

  // Troca do code por token no backend
  const exchangeAndSync = useCallback(async (code: string) => {
    const sessionData = sessionDataRef.current

    try {
      // Etapa 1: Trocar code por token e salvar credenciais
      setStep('exchanging_token')
      const callbackRes = await fetch('/api/settings/embedded-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          waba_id: sessionData.waba_id || '',
          phone_number_id: sessionData.phone_number_id || '',
        }),
      })

      if (!callbackRes.ok) {
        const err = await callbackRes.json().catch(() => ({}))
        throw new Error(err.error || 'Falha ao trocar token')
      }

      const callbackData = await callbackRes.json()
      const phoneNumberId = callbackData.phoneNumberId || sessionData.phone_number_id

      if (!phoneNumberId) {
        throw new Error('phone_number_id não retornado pelo fluxo')
      }

      // Etapa 2: Sincronizar contatos
      setStep('syncing_contacts')
      try {
        await fetch('/api/settings/embedded-signup/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone_number_id: phoneNumberId, sync_type: 'smb_app_state_sync' }),
        })
      } catch (e) {
        console.warn('[EmbeddedSignup] Sync contatos falhou (não-bloqueante):', e)
      }

      // Etapa 3: Sincronizar historico
      setStep('syncing_history')
      try {
        await fetch('/api/settings/embedded-signup/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone_number_id: phoneNumberId, sync_type: 'history' }),
        })
      } catch (e) {
        console.warn('[EmbeddedSignup] Sync histórico falhou (não-bloqueante):', e)
      }

      setStep('done')
      toast.success('WhatsApp conectado com sucesso!')
      onSuccess()
    } catch (err) {
      console.error('[EmbeddedSignup] Erro:', err)
      setStep('error')
      toast.error(err instanceof Error ? err.message : 'Erro ao conectar WhatsApp')
    }
  }, [onSuccess])

  // Click handler principal
  const handleClick = useCallback(() => {
    if (!window.FB || !CONFIG_ID) {
      toast.error('Facebook SDK não carregado ou Configuration ID ausente')
      return
    }

    registerSessionListener()
    setStep('waiting_popup')

    window.FB.login(
      (response) => {
        if (response.authResponse?.code) {
          exchangeAndSync(response.authResponse.code)
        } else {
          setStep('ready')
          if (response.status === 'not_authorized') {
            toast.error('Autorização negada. Tente novamente.')
          }
        }
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
        },
      }
    )
  }, [registerSessionListener, exchangeAndSync])

  const isDisabled = step === 'loading_sdk' || step === 'waiting_popup' || step === 'exchanging_token' || step === 'syncing_contacts' || step === 'syncing_history' || step === 'done'
  const isLoading = step !== 'idle' && step !== 'ready' && step !== 'error' && step !== 'done'
  const missingConfig = !appId || !CONFIG_ID

  if (missingConfig) {
    return null
  }

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={isDisabled}
        className={`group relative overflow-hidden rounded-xl h-10 px-4 text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        aria-label="Conectar conta do WhatsApp Business App via Facebook"
      >
        {isLoading && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
        {STEP_LABELS[step]}
      </button>
    )
  }

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <button
        onClick={handleClick}
        disabled={isDisabled}
        className="w-full flex items-center justify-center gap-3 h-12 px-6 rounded-xl bg-[#1877F2] hover:bg-[#166FE5] text-white font-medium text-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        aria-label="Conectar conta do WhatsApp Business App via Facebook"
      >
        {isLoading ? (
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
        )}
        {STEP_LABELS[step]}
      </button>

      {step !== 'idle' && step !== 'ready' && step !== 'error' && (
        <p className="text-xs text-[var(--ds-text-muted)]">
          {step === 'done'
            ? 'Conexão concluída com sucesso!'
            : 'Não feche esta janela durante o processo.'}
        </p>
      )}
    </div>
  )
}
