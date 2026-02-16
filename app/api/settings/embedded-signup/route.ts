import { NextRequest, NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'
import { getMetaAppCredentials } from '@/lib/meta-app-credentials'
import { fetchWithTimeout, safeJson, isAbortError } from '@/lib/server-http'

export const dynamic = 'force-dynamic'

/**
 * POST /api/settings/embedded-signup
 *
 * Recebe o authorization code do Embedded Signup (Cadastro Incorporado)
 * e troca por um token de acesso permanente via Graph API.
 *
 * Body: { code, waba_id, phone_number_id }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const { code, waba_id, phone_number_id } = body

    if (!code) {
      return NextResponse.json(
        { error: 'Campo obrigatório ausente: code' },
        { status: 400 }
      )
    }

    // Buscar credenciais do Meta App (appId + appSecret)
    const metaApp = await getMetaAppCredentials()
    if (!metaApp) {
      return NextResponse.json(
        { error: 'Meta App ID e Secret não configurados. Configure em Configurações > Editar.' },
        { status: 400 }
      )
    }

    // Etapa 1: Trocar o code por um access token
    const tokenUrl = new URL('https://graph.facebook.com/v24.0/oauth/access_token')
    tokenUrl.searchParams.set('client_id', metaApp.appId)
    tokenUrl.searchParams.set('client_secret', metaApp.appSecret)
    tokenUrl.searchParams.set('code', code)

    const tokenRes = await fetchWithTimeout(tokenUrl.toString(), { timeoutMs: 15000 })

    if (!tokenRes.ok) {
      const tokenErr = await safeJson<any>(tokenRes)
      console.error('[EmbeddedSignup] Falha ao trocar code:', tokenErr)
      return NextResponse.json(
        {
          error: 'Falha ao trocar o código por token de acesso',
          details: tokenErr?.error?.message || 'Erro desconhecido',
        },
        { status: 502 }
      )
    }

    const tokenData = await safeJson<{ access_token?: string }>(tokenRes)
    const accessToken = tokenData?.access_token

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Token de acesso não retornado pela Meta' },
        { status: 502 }
      )
    }

    // Etapa 2: Descobrir phone_number_id se nao foi fornecido via sessionInfo
    let resolvedPhoneNumberId = phone_number_id || ''
    let resolvedBusinessAccountId = waba_id || ''

    // Se temos waba_id mas nao phone_number_id, buscar da API
    if (resolvedBusinessAccountId && !resolvedPhoneNumberId) {
      try {
        const phonesRes = await fetchWithTimeout(
          `https://graph.facebook.com/v24.0/${resolvedBusinessAccountId}/phone_numbers?fields=id,display_phone_number,verified_name`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeoutMs: 8000,
          }
        )
        if (phonesRes.ok) {
          const phonesData = await safeJson<{ data?: Array<{ id: string }> }>(phonesRes)
          if (phonesData?.data?.[0]?.id) {
            resolvedPhoneNumberId = phonesData.data[0].id
          }
        }
      } catch (e) {
        console.warn('[EmbeddedSignup] Falha ao buscar phone numbers da WABA:', e)
      }
    }

    if (!resolvedPhoneNumberId) {
      return NextResponse.json(
        { error: 'Não foi possível determinar o phone_number_id. Tente novamente.' },
        { status: 400 }
      )
    }

    // Etapa 3: Buscar detalhes do telefone
    let displayPhoneNumber: string | undefined
    let verifiedName: string | undefined
    let isOnBizApp = false

    try {
      const phoneRes = await fetchWithTimeout(
        `https://graph.facebook.com/v24.0/${resolvedPhoneNumberId}?fields=display_phone_number,verified_name,is_on_biz_app,platform_type`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeoutMs: 8000,
        }
      )
      if (phoneRes.ok) {
        const phoneData = await safeJson<any>(phoneRes)
        displayPhoneNumber = phoneData?.display_phone_number
        verifiedName = phoneData?.verified_name
        isOnBizApp = phoneData?.is_on_biz_app === true
      }
    } catch (e) {
      console.warn('[EmbeddedSignup] Falha ao buscar detalhes do telefone:', e)
    }

    // Etapa 4: Salvar credenciais no banco
    await settingsDb.saveAll({
      phoneNumberId: resolvedPhoneNumberId,
      businessAccountId: resolvedBusinessAccountId,
      accessToken,
      isConnected: true,
    })

    console.log(
      `[EmbeddedSignup] Conectado com sucesso: WABA=${resolvedBusinessAccountId}, Phone=${resolvedPhoneNumberId}, BizApp=${isOnBizApp}`
    )

    return NextResponse.json({
      success: true,
      phoneNumberId: resolvedPhoneNumberId,
      businessAccountId: resolvedBusinessAccountId,
      displayPhoneNumber,
      verifiedName,
      isOnBizApp,
      message: 'Conectado via Embedded Signup com sucesso!',
    })
  } catch (error) {
    console.error('[EmbeddedSignup] Erro inesperado:', error)
    return NextResponse.json(
      { error: 'Erro interno ao processar Embedded Signup' },
      { status: isAbortError(error) ? 504 : 500 }
    )
  }
}
