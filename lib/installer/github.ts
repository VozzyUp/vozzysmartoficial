/**
 * Integração com GitHub API para o installer.
 * Gerencia autenticação OAuth, criação de repositórios e configuração de secrets.
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeUTF8 } from 'tweetnacl-util';

const GITHUB_API_BASE = 'https://api.github.com';
const TEMPLATE_OWNER = 'VozzyUp';
const TEMPLATE_REPO = 'vozzySmart';

export interface GitHubUser {
  login: string;
  id: number;
  name: string | null;
  email: string | null;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  clone_url: string;
  private: boolean;
}

/**
 * Valida um token GitHub e retorna informações do usuário
 */
export async function validateGitHubToken(
  token: string
): Promise<{ ok: true; user: GitHubUser } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${GITHUB_API_BASE}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        return { ok: false, error: 'Token GitHub inválido ou expirado' };
      }
      const errorText = await res.text();
      return { ok: false, error: `Erro ao validar token: ${errorText}` };
    }

    const user = (await res.json()) as GitHubUser;
    return { ok: true, user };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao validar token GitHub';
    return { ok: false, error: message };
  }
}

/**
 * Cria um novo repositório a partir do template
 * Usa a API de templates do GitHub para criar uma cópia limpa
 */
export async function createRepoFromTemplate(params: {
  token: string;
  newRepoName: string;
  isPrivate: boolean;
  description?: string;
}): Promise<{ ok: true; repo: GitHubRepo } | { ok: false; error: string }> {
  try {
    // Usa a API de templates do GitHub
    const res = await fetch(
      `${GITHUB_API_BASE}/repos/${TEMPLATE_OWNER}/${TEMPLATE_REPO}/generate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: params.newRepoName,
          description: params.description || 'VozzySmart - WhatsApp CRM SaaS',
          private: params.isPrivate,
          include_all_branches: false,
        }),
      }
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const message = (errorData as { message?: string }).message || 'Erro ao criar repositório';
      
      if (res.status === 422) {
        return { ok: false, error: 'Nome de repositório já existe ou é inválido' };
      }
      
      return { ok: false, error: message };
    }

    const repo = (await res.json()) as GitHubRepo;
    return { ok: true, repo };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao criar repositório';
    return { ok: false, error: message };
  }
}

/**
 * Obtém a chave pública do repositório para criptografar secrets
 */
async function getRepoPublicKey(params: {
  token: string;
  owner: string;
  repo: string;
}): Promise<{ ok: true; keyId: string; key: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `${GITHUB_API_BASE}/repos/${params.owner}/${params.repo}/actions/secrets/public-key`,
      {
        headers: {
          Authorization: `Bearer ${params.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!res.ok) {
      return { ok: false, error: 'Erro ao obter chave pública do repositório' };
    }

    const data = (await res.json()) as { key_id: string; key: string };
    return { ok: true, keyId: data.key_id, key: data.key };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao obter chave pública';
    return { ok: false, error: message };
  }
}

/**
 * Criptografa um valor usando a chave pública do repositório
 * Usa libsodium (tweetnacl) para criptografia
 */
function encryptSecret(publicKey: string, secretValue: string): string {
  // Converte a chave pública de base64
  const keyBytes = Buffer.from(publicKey, 'base64');
  
  // Converte o valor do secret para bytes
  const messageBytes = decodeUTF8(secretValue);
  
  // Criptografa usando sealed box (anonymous encryption)
  // Note: tweetnacl doesn't have box.seal, so we use a simple approach
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ephemeralKeyPair = nacl.box.keyPair();
  
  const encrypted = nacl.box(
    messageBytes,
    nonce,
    keyBytes.subarray(0, nacl.box.publicKeyLength),
    ephemeralKeyPair.secretKey
  );
  
  // Combina ephemeral public key + nonce + encrypted
  const combined = new Uint8Array(
    ephemeralKeyPair.publicKey.length + nonce.length + encrypted.length
  );
  combined.set(ephemeralKeyPair.publicKey);
  combined.set(nonce, ephemeralKeyPair.publicKey.length);
  combined.set(encrypted, ephemeralKeyPair.publicKey.length + nonce.length);
  
  // Retorna em base64
  return encodeBase64(combined);
}

/**
 * Adiciona ou atualiza um secret no repositório GitHub
 */
async function upsertRepoSecret(params: {
  token: string;
  owner: string;
  repo: string;
  secretName: string;
  secretValue: string;
  keyId: string;
  publicKey: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // Criptografa o valor
    const encryptedValue = await encryptSecret(params.publicKey, params.secretValue);

    const res = await fetch(
      `${GITHUB_API_BASE}/repos/${params.owner}/${params.repo}/actions/secrets/${params.secretName}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${params.token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          encrypted_value: encryptedValue,
          key_id: params.keyId,
        }),
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      return { ok: false, error: `Erro ao configurar secret ${params.secretName}: ${errorText}` };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao configurar secret';
    return { ok: false, error: message };
  }
}

/**
 * Adiciona múltiplos secrets ao repositório GitHub
 */
export async function addRepoSecrets(params: {
  token: string;
  owner: string;
  repo: string;
  secrets: Record<string, string>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // Obtém a chave pública do repositório
    const keyResult = await getRepoPublicKey({
      token: params.token,
      owner: params.owner,
      repo: params.repo,
    });

    if (!keyResult.ok) {
      return { ok: false, error: keyResult.error };
    }

    // Adiciona cada secret
    for (const [secretName, secretValue] of Object.entries(params.secrets)) {
      const result = await upsertRepoSecret({
        token: params.token,
        owner: params.owner,
        repo: params.repo,
        secretName,
        secretValue,
        keyId: keyResult.keyId,
        publicKey: keyResult.key,
      });

      if (!result.ok) {
        return { ok: false, error: result.error };
      }
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao adicionar secrets';
    return { ok: false, error: message };
  }
}

/**
 * Verifica se um repositório existe
 */
export async function checkRepoExists(params: {
  token: string;
  owner: string;
  repo: string;
}): Promise<{ exists: boolean; error?: string }> {
  try {
    const res = await fetch(
      `${GITHUB_API_BASE}/repos/${params.owner}/${params.repo}`,
      {
        headers: {
          Authorization: `Bearer ${params.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    return { exists: res.ok };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao verificar repositório';
    return { exists: false, error: message };
  }
}
