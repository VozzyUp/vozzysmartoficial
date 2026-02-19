import { NextRequest, NextResponse } from 'next/server'
import { requireSessionOrApiKey } from '@/lib/request-auth'
import { validateGitHubToken } from '@/lib/installer/github'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface ConnectGitHubRequest {
  token: string
}

interface ConnectGitHubResponse {
  success: boolean
  error?: string
  message?: string
}

/**
 * POST /api/updates/github/connect
 * 
 * Conecta GitHub fornecendo um token manualmente.
 * O token será validado e pode ser armazenado (se implementarmos storage).
 * 
 * Por enquanto, apenas valida o token. O token deve ser configurado
 * como variável de ambiente GITHUB_TOKEN no Vercel.
 */
export async function POST(request: NextRequest) {
  try {
    // Autenticação obrigatória
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    const body: ConnectGitHubRequest = await request.json()
    const { token } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json<ConnectGitHubResponse>(
        {
          success: false,
          error: 'Token GitHub não fornecido',
        },
        { status: 400 }
      )
    }

    // Validar token
    const validation = await validateGitHubToken(token)

    if (!validation.ok) {
      return NextResponse.json<ConnectGitHubResponse>(
        {
          success: false,
          error: validation.error || 'Token GitHub inválido',
        },
        { status: 401 }
      )
    }

    // Por enquanto, apenas validamos o token
    // Em produção, o token deve ser configurado como GITHUB_TOKEN no Vercel
    // TODO: Se quisermos armazenar token em settings table, fazer aqui
    
    return NextResponse.json<ConnectGitHubResponse>({
      success: true,
      message: 'Token GitHub validado com sucesso! Configure GITHUB_TOKEN como variável de ambiente no Vercel para usar atualizações automáticas.',
    })
  } catch (error) {
    console.error('[GitHub Connect] Erro:', error)
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    return NextResponse.json<ConnectGitHubResponse>(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    )
  }
}
