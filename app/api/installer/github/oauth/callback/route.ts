import { NextRequest, NextResponse } from 'next/server';

const GITHUB_OAUTH_CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID || process.env.NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID || '';
const GITHUB_OAUTH_CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET || '';

/**
 * GET /api/installer/github/oauth/callback
 * 
 * Callback do GitHub OAuth - troca o code por um access token
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code) {
      return new NextResponse(
        `
        <!DOCTYPE html>
        <html>
          <head><title>GitHub OAuth Error</title></head>
          <body>
            <script>
              window.opener.postMessage({
                type: 'github-oauth-error',
                error: 'Código de autorização não recebido'
              }, window.location.origin);
              window.close();
            </script>
          </body>
        </html>
        `,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Debug logs
    console.log('[GitHub OAuth] Client ID present:', !!GITHUB_OAUTH_CLIENT_ID);
    console.log('[GitHub OAuth] Client Secret present:', !!GITHUB_OAUTH_CLIENT_SECRET);
    console.log('[GitHub OAuth] Exchanging code for token...');

    // Constrói a mesma redirect_uri usada no frontend
    const redirect_uri = `${request.nextUrl.origin}/api/installer/github/oauth/callback`;

    // Troca o code por um access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_OAUTH_CLIENT_ID,
        client_secret: GITHUB_OAUTH_CLIENT_SECRET,
        code,
        redirect_uri, // Importante: deve dar match com o usado no frontend
      }),
    });

    const tokenData = await tokenResponse.json();
    console.log('[GitHub OAuth] Token response:', JSON.stringify(tokenData));

    if (!tokenData.access_token) {
      console.error('[GitHub OAuth] Failed to get token:', tokenData);
      
      const errorMessage = tokenData.error_description || tokenData.error || 'Erro desconhecido na troca de token';
      
      return new NextResponse(
        `
        <!DOCTYPE html>
        <html>
          <head><title>GitHub OAuth Error</title></head>
          <body>
            <script>
              window.opener.postMessage({
                type: 'github-oauth-error',
                error: 'Erro GitHub: ${errorMessage.replace(/'/g, "\\'")}'
              }, window.location.origin);
              window.close();
            </script>
          </body>
        </html>
        `,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Obtém informações do usuário
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    const userData = await userResponse.json();

    // Retorna HTML que envia mensagem para o opener
    return new NextResponse(
      `
      <!DOCTYPE html>
      <html>
        <head><title>GitHub OAuth Success</title></head>
        <body>
          <h2>Autenticação bem-sucedida!</h2>
          <p>Você pode fechar esta janela.</p>
          <script>
            window.opener.postMessage({
              type: 'github-oauth-success',
              token: '${tokenData.access_token}',
              username: '${userData.login}'
            }, window.location.origin);
            setTimeout(() => window.close(), 1000);
          </script>
        </body>
      </html>
      `,
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (error) {
    console.error('[GitHub OAuth Callback] Error:', error);
    return new NextResponse(
      `
      <!DOCTYPE html>
      <html>
        <head><title>GitHub OAuth Error</title></head>
        <body>
          <script>
            window.opener.postMessage({
              type: 'github-oauth-error',
              error: 'Erro durante autenticação'
            }, window.location.origin);
            window.close();
          </script>
        </body>
      </html>
      `,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}
