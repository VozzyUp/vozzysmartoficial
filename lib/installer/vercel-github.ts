/**
 * Integração Vercel + GitHub para o installer.
 * Conecta projetos Vercel a repositórios GitHub.
 */

const VERCEL_API_BASE = 'https://api.vercel.com';

interface VercelGitRepo {
  type: 'github';
  repo: string; // owner/repo format
}

interface VercelProject {
  id: string;
  name: string;
  link?: VercelGitRepo;
}

/**
 * Conecta um projeto Vercel a um repositório GitHub
 */
export async function connectVercelToGitHub(params: {
  vercelToken: string;
  projectId?: string;
  projectName?: string;
  githubRepoFullName: string; // owner/repo format
  teamId?: string;
}): Promise<{ ok: true; projectId: string } | { ok: false; error: string }> {
  try {
    const url = new URL(`${VERCEL_API_BASE}/v9/projects${params.projectId ? `/${params.projectId}` : ''}`);
    if (params.teamId) {
      url.searchParams.set('teamId', params.teamId);
    }

    const body: Record<string, unknown> = {
      gitRepository: {
        type: 'github',
        repo: params.githubRepoFullName,
      },
    };

    // Se não temos projectId, precisamos criar um novo projeto
    if (!params.projectId && params.projectName) {
      body.name = params.projectName;
    }

    const res = await fetch(url.toString(), {
      method: params.projectId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${params.vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return { ok: false, error: `Erro ao conectar Vercel ao GitHub: ${errorText}` };
    }

    const project = (await res.json()) as VercelProject;
    return { ok: true, projectId: project.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao conectar Vercel ao GitHub';
    return { ok: false, error: message };
  }
}

/**
 * Cria um novo projeto Vercel conectado a um repositório GitHub
 */
export async function createVercelProjectFromGitHub(params: {
  vercelToken: string;
  projectName: string;
  githubRepoFullName: string;
  teamId?: string;
  environmentVariables?: Array<{
    key: string;
    value: string;
    target: ('production' | 'preview' | 'development')[];
  }>;
}): Promise<{ ok: true; projectId: string; deploymentUrl?: string } | { ok: false; error: string }> {
  try {
    const url = new URL(`${VERCEL_API_BASE}/v10/projects`);
    if (params.teamId) {
      url.searchParams.set('teamId', params.teamId);
    }

    const body: Record<string, unknown> = {
      name: params.projectName,
      gitRepository: {
        type: 'github',
        repo: params.githubRepoFullName,
      },
      framework: 'nextjs',
      buildCommand: 'npm run build',
      devCommand: 'npm run dev',
      installCommand: 'npm install',
      outputDirectory: '.next',
    };

    if (params.environmentVariables && params.environmentVariables.length > 0) {
      body.environmentVariables = params.environmentVariables.map((env) => ({
        key: env.key,
        value: env.value,
        target: env.target,
        type: 'encrypted',
      }));
    }

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return { ok: false, error: `Erro ao criar projeto Vercel: ${errorText}` };
    }

    const project = (await res.json()) as VercelProject & { latestDeployments?: Array<{ url: string }> };
    
    return {
      ok: true,
      projectId: project.id,
      deploymentUrl: project.latestDeployments?.[0]?.url,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao criar projeto Vercel';
    return { ok: false, error: message };
  }
}

/**
 * Dispara um deployment inicial do repositório GitHub
 */
export async function triggerGitHubDeployment(params: {
  vercelToken: string;
  projectId: string;
  teamId?: string;
}): Promise<{ ok: true; deploymentId: string; url: string } | { ok: false; error: string }> {
  try {
    const url = new URL(`${VERCEL_API_BASE}/v13/deployments`);
    if (params.teamId) {
      url.searchParams.set('teamId', params.teamId);
    }

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: params.projectId,
        project: params.projectId,
        target: 'production',
        gitSource: {
          type: 'github',
          ref: 'main',
        },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return { ok: false, error: `Erro ao disparar deployment: ${errorText}` };
    }

    const deployment = (await res.json()) as { id: string; url: string };
    return {
      ok: true,
      deploymentId: deployment.id,
      url: deployment.url,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao disparar deployment';
    return { ok: false, error: message };
  }
}
