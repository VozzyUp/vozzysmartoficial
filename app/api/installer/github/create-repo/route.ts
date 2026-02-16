import { NextRequest, NextResponse } from 'next/server';
import { createRepoFromTemplate } from '@/lib/installer/github';

/**
 * POST /api/installer/github/create-repo
 * 
 * Cria um novo repositório a partir do template VozzySmart
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, repoName, isPrivate } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Token não fornecido' },
        { status: 400 }
      );
    }

    if (!repoName || typeof repoName !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Nome do repositório não fornecido' },
        { status: 400 }
      );
    }

    const result = await createRepoFromTemplate({
      token,
      newRepoName: repoName,
      isPrivate: isPrivate !== false, // Default to private
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      repo: {
        name: result.repo.name,
        full_name: result.repo.full_name,
        html_url: result.repo.html_url,
        clone_url: result.repo.clone_url,
        private: result.repo.private,
      },
    });
  } catch (error) {
    console.error('[GitHub Create Repo] Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Erro ao criar repositório' },
      { status: 500 }
    );
  }
}
