import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';

// Token secreto para validar que a requisição vem da sua plataforma de vendas
// Configure isso no .env: SALES_WEBHOOK_SECRET=sua_senha_secreta_aqui
const WEBHOOK_SECRET = process.env.SALES_WEBHOOK_SECRET;

export async function POST(request: Request) {
  try {
    // 1. Validação de Segurança
    // Verifica se o secret foi configurado
    if (!WEBHOOK_SECRET) {
      console.error('[Webhook] SALES_WEBHOOK_SECRET não configurado');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Verifica assinatura ou token (exemplo genérico usando header 'x-webhook-secret')
    // Adaptar conforme a plataforma (Hotmart usa hottok, Stripe usa assinatura, etc)
    const authHeader = request.headers.get('x-webhook-secret');
    const urlParams = new URL(request.url).searchParams;
    const queryToken = urlParams.get('token'); // Algumas plataformas mandam na URL

    if (authHeader !== WEBHOOK_SECRET && queryToken !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // 2. Extração de Dados (Adaptar conforme sua plataforma)
    // Exemplo genérico: { email, name, order_id, product_id, status }
    const { email, name, order_id, status } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Se a venda foi cancelada/reembolsada, podemos revogar a licença (opcional)
    if (status === 'refunded' || status === 'canceled') {
      // Implementar lógica de revogação se necessário
      return NextResponse.json({ message: 'Ignored: status is not approved' });
    }

    // 3. Gerar Código de Licença Único
    // Formato: VOZ-XXXX-YYYY (8 chars aleatórios)
    const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 chars
    const licenseCode = `VOZ-${randomPart.substring(0, 4)}-${randomPart.substring(4, 8)}`;

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }

    // 4. Salvar no Banco
    const { data, error } = await supabase
      .from('licenses')
      .insert({
        code: licenseCode,
        customer_email: email,
        customer_name: name || 'Cliente',
        metadata: body, // Salva todo o payload para referência
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      console.error('[Webhook] Erro ao criar licença:', error);
      return NextResponse.json({ error: 'Failed to create license' }, { status: 500 });
    }

    console.log(`[Webhook] Licença criada para ${email}: ${licenseCode}`);

    // 5. Retorno (Algumas plataformas usam isso para exibir pro cliente)
    return NextResponse.json({
      success: true,
      license_code: licenseCode,
      message: 'Licença gerada com sucesso'
    });

  } catch (err) {
    console.error('[Webhook] Erro processando requisição:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
