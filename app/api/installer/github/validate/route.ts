import { NextRequest, NextResponse } from 'next/server';
import { validateGitHubToken } from '@/lib/installer/github';

/**
 * POST /api/installer/github/validate
 * 
 * Valida um token GitHub e retorna informações do usuário
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Token não fornecido' },
        { status: 400 }
      );
    }

    const result = await validateGitHubToken(token);

    if (!result.ok) {
      return NextResponse.json(result, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      user: {
        login: result.user.login,
        name: result.user.name,
        email: result.user.email,
      },
    });
  } catch (error) {
    console.error('[GitHub Validate] Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Erro ao validar token' },
      { status: 500 }
    );
  }
}
