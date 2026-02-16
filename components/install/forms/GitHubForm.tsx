'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Github, Loader2, CheckCircle2, ExternalLink, AlertCircle } from 'lucide-react';
import type { FormProps } from './types';

const GITHUB_OAUTH_CLIENT_ID = process.env.NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID || '';
const GITHUB_OAUTH_REDIRECT_URI = typeof window !== 'undefined' 
  ? `${window.location.origin}/api/installer/github/oauth/callback`
  : '';

export function GitHubForm({ data, onComplete, onBack, showBack }: FormProps) {
  const [githubToken, setGithubToken] = useState(data.githubToken || '');
  const [githubUsername, setGithubUsername] = useState(data.githubUsername || '');
  const [repoName, setRepoName] = useState(data.githubRepoName || 'vozzysmart');
  const [isPrivate, setIsPrivate] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [tokenValidated, setTokenValidated] = useState(!!data.githubToken);

  // OAuth Flow
  const handleGitHubOAuth = useCallback(() => {
    if (!GITHUB_OAUTH_CLIENT_ID) {
      setError('GitHub OAuth não configurado. Configure NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID');
      return;
    }

    const scope = 'repo,user:email';
    const state = Math.random().toString(36).substring(7);
    sessionStorage.setItem('github_oauth_state', state);

    const authUrl = new URL('https://github.com/login/oauth/authorize');
    authUrl.searchParams.set('client_id', GITHUB_OAUTH_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', GITHUB_OAUTH_REDIRECT_URI);
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('state', state);

    // Abre popup OAuth
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl.toString(),
      'GitHub OAuth',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    // Listener para receber o token do popup
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'github-oauth-success') {
        setGithubToken(event.data.token);
        setGithubUsername(event.data.username);
        setTokenValidated(true);
        popup?.close();
        window.removeEventListener('message', handleMessage);
      } else if (event.data.type === 'github-oauth-error') {
        setError(event.data.error);
        popup?.close();
        window.removeEventListener('message', handleMessage);
      }
    };

    window.addEventListener('message', handleMessage);
  }, []);

  // Validação manual de token
  const handleValidateToken = useCallback(async () => {
    if (!githubToken.trim()) {
      setError('Digite um token GitHub');
      return;
    }

    setIsValidating(true);
    setError('');

    try {
      const res = await fetch('/api/installer/github/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken }),
      });

      const result = await res.json();

      if (!res.ok || !result.ok) {
        setError(result.error || 'Token inválido');
        setTokenValidated(false);
        return;
      }

      setGithubUsername(result.user.login);
      setTokenValidated(true);
    } catch (err) {
      setError('Erro ao validar token');
      setTokenValidated(false);
    } finally {
      setIsValidating(false);
    }
  }, [githubToken]);

  // Criação do repositório
  const handleCreateRepo = useCallback(async () => {
    if (!repoName.trim()) {
      setError('Digite um nome para o repositório');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      const res = await fetch('/api/installer/github/create-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: githubToken,
          repoName: repoName.trim(),
          isPrivate,
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.ok) {
        setError(result.error || 'Erro ao criar repositório');
        return;
      }

      // Sucesso! Passa os dados para o próximo step
      onComplete({
        githubToken,
        githubUsername,
        githubRepoName: result.repo.name,
        githubRepoUrl: result.repo.html_url,
        githubRepoFullName: result.repo.full_name,
      });
    } catch (err) {
      setError('Erro ao criar repositório');
    } finally {
      setIsCreating(false);
    }
  }, [githubToken, repoName, isPrivate, githubUsername, onComplete]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Conectar GitHub</h2>
        <p className="text-muted-foreground">
          Crie um repositório a partir do template VozzySmart
        </p>
      </div>

      {error && (
        <Alert variant="error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Step 1: Autenticação */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>1. Autenticar com GitHub</Label>
          {tokenValidated && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Conectado como @{githubUsername}
            </div>
          )}
        </div>

        {!tokenValidated ? (
          <div className="space-y-4">
            {/* OAuth Option */}
            <div className="space-y-3">
              <Alert>
                <Github className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>Conectar com GitHub (Recomendado)</strong>
                  <p className="mt-1 text-muted-foreground">
                    Ao clicar no botão abaixo, você será redirecionado para o GitHub onde poderá:
                  </p>
                  <ul className="mt-2 ml-4 space-y-1 text-muted-foreground list-disc">
                    <li><strong>Se já tem conta:</strong> Faça login normalmente</li>
                    <li><strong>Se não tem conta:</strong> Clique em "Create an account" na página do GitHub</li>
                  </ul>
                </AlertDescription>
              </Alert>

              <Button
                type="button"
                onClick={handleGitHubOAuth}
                className="w-full"
                size="lg"
              >
                <Github className="mr-2 h-5 w-5" />
                Conectar com GitHub
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Ou use um token manual
                </span>
              </div>
            </div>

            {/* Manual Token Option */}
            <div className="space-y-3">
              <Alert>
                <AlertDescription className="text-sm">
                  <strong>Usar Token Manual</strong>
                  <p className="mt-1 text-muted-foreground">
                    Se preferir, você pode criar um token de acesso pessoal:
                  </p>
                  <ol className="mt-2 ml-4 space-y-1 text-muted-foreground list-decimal">
                    <li>Acesse o link abaixo e faça login no GitHub</li>
                    <li>Clique em "Generate token" no final da página</li>
                    <li>Copie o token gerado (começa com ghp_)</li>
                    <li>Cole o token no campo abaixo</li>
                  </ol>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="githubToken">Token de Acesso Pessoal</Label>
                <Input
                  id="githubToken"
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxx"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  disabled={isValidating}
                />
                <Button
                  type="button"
                  onClick={handleValidateToken}
                  disabled={isValidating || !githubToken.trim()}
                  variant="outline"
                  className="w-full"
                >
                  {isValidating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Validar Token
                </Button>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" />
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo,user:email&description=VozzySmart%20Installer"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Criar token no GitHub (abre em nova aba)
                  </a>
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Step 2: Configurar Repositório */}
      {tokenValidated && (
        <div className="space-y-4">
          <Label>2. Configurar Repositório</Label>
          
          <div className="space-y-2">
            <Label htmlFor="repoName">Nome do Repositório</Label>
            <Input
              id="repoName"
              type="text"
              placeholder="vozzysmart"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground">
              Será criado em: github.com/{githubUsername}/{repoName}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isPrivate"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              disabled={isCreating}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="isPrivate" className="font-normal">
              Repositório privado (recomendado)
            </Label>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {showBack && (
          <Button type="button" variant="outline" onClick={onBack} className="flex-1">
            Voltar
          </Button>
        )}
        <Button
          type="button"
          onClick={handleCreateRepo}
          disabled={!tokenValidated || isCreating || !repoName.trim()}
          className="flex-1"
        >
          {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isCreating ? 'Criando...' : 'Criar Repositório e Continuar'}
        </Button>
      </div>
    </div>
  );
}
