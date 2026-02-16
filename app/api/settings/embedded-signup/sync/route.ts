import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { fetchWithTimeout, safeJson, isAbortError } from '@/lib/server-http'

export const dynamic = 'force-dynamic'

/**
 * POST /api/settings/embedded-signup/sync
 *
 * Dispara sincronizacao de contatos ou historico de mensagens
 * do app WhatsApp Business via Cloud API.
 *
 * Body: { phone_number_id, sync_type: "smb_app_state_sync" | "history" }
 *
 * A sincronizacao deve ser feita em ate 24h apos o Embedded Signup.
 * Os dados serao recebidos via webhooks (smb_app_state_sync e history).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const { phone_number_id, sync_type } = body

    if (!phone_number_id) {
      return NextResponse.json(
        { error: 'Campo obrigatório ausente: phone_number_id' },
        { status: 400 }
      )
    }

    if (!sync_type || !['smb_app_state_sync', 'history'].includes(sync_type)) {
      return NextResponse.json(
        { error: 'sync_type inválido. Use "smb_app_state_sync" ou "history".' },
        { status: 400 }
      )
    }

    // Buscar credenciais
    const credentials = await getWhatsAppCredentials()
    if (!credentials?.accessToken) {
      return NextResponse.json(
        { error: 'Credenciais do WhatsApp não configuradas' },
        { status: 400 }
      )
    }

    // Chamar API da Meta para iniciar sincronizacao
    const syncRes = await fetchWithTimeout(
      `https://graph.facebook.com/v24.0/${phone_number_id}/smb_app_data`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          sync_type,
        }),
        timeoutMs: 15000,
      }
    )

    if (!syncRes.ok) {
      const syncErr = await safeJson<any>(syncRes)
      console.error(`[EmbeddedSignup/Sync] Falha (${sync_type}):`, syncErr)
      return NextResponse.json(
        {
          error: `Falha ao iniciar sincronização (${sync_type})`,
          details: syncErr?.error?.message || 'Erro desconhecido',
        },
        { status: syncRes.status >= 400 && syncRes.status < 500 ? syncRes.status : 502 }
      )
    }

    const syncData = await safeJson<{
      messaging_product?: string
      request_id?: string
    }>(syncRes)

    console.log(
      `[EmbeddedSignup/Sync] ${sync_type} iniciado: request_id=${syncData?.request_id}`
    )

    return NextResponse.json({
      success: true,
      sync_type,
      request_id: syncData?.request_id || null,
      message: sync_type === 'smb_app_state_sync'
        ? 'Sincronização de contatos iniciada. Os dados chegarão via webhooks.'
        : 'Sincronização de histórico iniciada. As mensagens chegarão via webhooks.',
    })
  } catch (error) {
    console.error('[EmbeddedSignup/Sync] Erro inesperado:', error)
    return NextResponse.json(
      { error: 'Erro interno ao iniciar sincronização' },
      { status: isAbortError(error) ? 504 : 500 }
    )
  }
}
