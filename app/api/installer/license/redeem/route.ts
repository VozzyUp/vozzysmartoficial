import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { code, vercelUrl, projectVersion } = await request.json();

    if (!code) {
      return NextResponse.json(
        { error: 'Código da licença é obrigatório' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Erro de configuração do servidor (Supabase)' },
        { status: 500 }
      );
    }

    // 1. Verifica estado atual antes de tentar update
    const { data: license, error: fetchError } = await supabase
      .from('licenses')
      .select('id, status')
      .eq('code', code)
      .single();

    if (fetchError || !license) {
      return NextResponse.json(
        { error: 'Licença não encontrada para ativação' },
        { status: 404 }
      );
    }

    if (license.status !== 'active') {
      return NextResponse.json(
        { error: `Não é possível ativar licença com status: ${license.status}` },
        { status: 400 }
      );
    }

    // 2. Realiza o update (Redeem)
    const { error: updateError } = await supabase
      .from('licenses')
      .update({
        status: 'used',
        installed_at: new Date().toISOString(),
        installed_url: vercelUrl || null,
        installed_version: projectVersion || 'unknown',
      })
      .eq('id', license.id);

    if (updateError) {
      console.error('[License Redeem] Update error:', updateError);
      return NextResponse.json(
        { error: 'Falha ao ativar a licença no banco de dados' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Licença ativada com sucesso'
    });

  } catch (err) {
    console.error('[License Redeem] Error:', err);
    return NextResponse.json(
      { error: 'Erro interno ao ativar licença' },
      { status: 500 }
    );
  }
}
