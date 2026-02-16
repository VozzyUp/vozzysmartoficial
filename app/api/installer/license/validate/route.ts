import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { code } = await request.json();

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

    // Busca a licença pelo código
    const { data: license, error } = await supabase
      .from('licenses')
      .select('id, status, customer_name, customer_email')
      .eq('code', code)
      .single();

    if (error || !license) {
      return NextResponse.json(
        { error: 'Licença inválida ou não encontrada' },
        { status: 404 }
      );
    }

    // Verifica status
    if (license.status === 'used') {
      return NextResponse.json(
        { error: 'Esta licença já foi utilizada' },
        { status: 400 }
      );
    }

    if (license.status === 'revoked') {
      return NextResponse.json(
        { error: 'Esta licença foi revogada. Contate o suporte.' },
        { status: 403 }
      );
    }

    // Sucesso - retorna dados básicos (sem expor ID interno se não precisar)
    return NextResponse.json({
      valid: true,
      customerName: license.customer_name || 'Cliente',
      customerEmail: license.customer_email
    });

  } catch (err) {
    console.error('[License Validate] Error:', err);
    return NextResponse.json(
      { error: 'Erro interno ao validar licença' },
      { status: 500 }
    );
  }
}
