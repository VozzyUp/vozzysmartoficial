/**
 * GitHub Update Utilities
 * 
 * Funções para atualizar arquivos no repositório GitHub do cliente
 * via GitHub API, ao invés de tentar escrever diretamente no filesystem.
 */

const GITHUB_API_BASE = 'https://api.github.com'

export interface GitHubRepoInfo {
  owner: string
  repo: string
  branch: string
}

export interface GitHubFileCommit {
  path: string
  content: string
  message: string
}

/**
 * Obtém informações do repositório GitHub conectado no Vercel
 * via API do Vercel ou variáveis de ambiente
 */
export async function getGitHubRepoFromVercel(): Promise<GitHubRepoInfo | null> {
  // Tentar via variáveis de ambiente primeiro (mais rápido)
  const repoOwner = process.env.VERCEL_GIT_REPO_OWNER
  const repoSlug = process.env.VERCEL_GIT_REPO_SLUG
  
  if (repoOwner && repoSlug) {
    return {
      owner: repoOwner,
      repo: repoSlug,
      branch: process.env.VERCEL_GIT_COMMIT_REF || 'main',
    }
  }

  // Fallback: tentar via API Vercel se temos token e projectId
  const vercelToken = process.env.VERCEL_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  
  if (vercelToken && projectId) {
    try {
      // Importar apenas quando necessário para evitar problemas de circular dependency
      const vercelApi = await import('@/lib/vercel-api')
      const result = await vercelApi.getProjectGitRepo(
        vercelToken,
        projectId,
        process.env.VERCEL_TEAM_ID || undefined
      )
      
      if (result.success && result.data) {
        return result.data
      }
    } catch (error) {
      console.error('[getGitHubRepoFromVercel] Erro ao buscar via API:', error)
    }
  }

  return null
}

/**
 * Obtém token GitHub de variáveis de ambiente ou settings
 */
export async function getGitHubToken(): Promise<string | null> {
  // Tentar variável de ambiente primeiro
  const envToken = process.env.GITHUB_TOKEN
  if (envToken) {
    return envToken
  }

  // TODO: Tentar buscar de settings table (Supabase) se necessário
  // Por enquanto, retorna null e usuário precisa conectar via UI
  
  return null
}

/**
 * Obtém conteúdo de um arquivo do GitHub
 */
export async function getFileFromGitHub(params: {
  token: string
  owner: string
  repo: string
  path: string
  branch?: string
}): Promise<{ content: string; sha: string } | null> {
  try {
    const branch = params.branch || 'main'
    const url = `${GITHUB_API_BASE}/repos/${params.owner}/${params.repo}/contents/${params.path}?ref=${branch}`
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${params.token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return null // Arquivo não existe
      }
      throw new Error(`Falha ao buscar arquivo: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    
    // GitHub retorna conteúdo em base64
    const content = Buffer.from(data.content, 'base64').toString('utf8')
    
    return {
      content,
      sha: data.sha,
    }
  } catch (error) {
    console.error('[getFileFromGitHub] Erro:', error)
    throw error
  }
}

/**
 * Cria ou atualiza um arquivo no GitHub via API
 */
export async function createFileCommit(params: {
  token: string
  owner: string
  repo: string
  path: string
  content: string
  message: string
  branch?: string
  sha?: string // Se fornecido, atualiza arquivo existente
}): Promise<{ commit: { sha: string; url: string } }> {
  try {
    const branch = params.branch || 'main'
    
    // Converter conteúdo para base64
    const contentBase64 = Buffer.from(params.content, 'utf8').toString('base64')
    
    const url = `${GITHUB_API_BASE}/repos/${params.owner}/${params.repo}/contents/${params.path}`
    
    const body: any = {
      message: params.message,
      content: contentBase64,
      branch,
    }

    // Se temos SHA, estamos atualizando arquivo existente
    if (params.sha) {
      body.sha = params.sha
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${params.token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = (errorData as { message?: string }).message || `Falha ao criar commit: ${response.status}`
      throw new Error(errorMessage)
    }

    const data = await response.json()
    return {
      commit: {
        sha: data.commit.sha,
        url: data.commit.html_url,
      },
    }
  } catch (error) {
    console.error('[createFileCommit] Erro:', error)
    throw error
  }
}

/**
 * Atualiza múltiplos arquivos no GitHub
 * Retorna array de commits criados
 */
export async function updateFilesViaGitHub(params: {
  token: string
  owner: string
  repo: string
  branch?: string
  files: GitHubFileCommit[]
}): Promise<Array<{ path: string; commit: { sha: string; url: string } }>> {
  const results: Array<{ path: string; commit: { sha: string; url: string } }> = []
  const branch = params.branch || 'main'

  for (const file of params.files) {
    try {
      // Tentar obter SHA do arquivo existente (se existir)
      let sha: string | undefined
      try {
        const existingFile = await getFileFromGitHub({
          token: params.token,
          owner: params.owner,
          repo: params.repo,
          path: file.path,
          branch,
        })
        sha = existingFile?.sha
      } catch {
        // Arquivo não existe, será criado
      }

      const commitResult = await createFileCommit({
        token: params.token,
        owner: params.owner,
        repo: params.repo,
        path: file.path,
        content: file.content,
        message: file.message,
        branch,
        sha,
      })

      results.push({
        path: file.path,
        commit: commitResult.commit,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido'
      throw new Error(`Falha ao atualizar ${file.path}: ${errorMsg}`)
    }
  }

  return results
}

/**
 * Atualiza vozsmart.config.json no GitHub
 * Atualiza apenas os campos coreVersion e lastUpdate
 */
export async function updateConfigFile(params: {
  token: string
  owner: string
  repo: string
  branch?: string
  coreVersion: string
}): Promise<{ commit: { sha: string; url: string } }> {
  const branch = params.branch || 'main'

  // Obter config atual
  const currentConfig = await getFileFromGitHub({
    token: params.token,
    owner: params.owner,
    repo: params.repo,
    path: 'vozsmart.config.json',
    branch,
  })

  if (!currentConfig) {
    throw new Error('vozsmart.config.json não encontrado no repositório')
  }

  // Parse e atualizar apenas campos necessários
  const config = JSON.parse(currentConfig.content)
  const updatedConfig = {
    ...config,
    coreVersion: params.coreVersion,
    lastUpdate: new Date().toISOString(),
  }

  // Commit atualização
  return createFileCommit({
    token: params.token,
    owner: params.owner,
    repo: params.repo,
    path: 'vozsmart.config.json',
    content: JSON.stringify(updatedConfig, null, 2),
    message: `chore: atualizar coreVersion para ${params.coreVersion}`,
    branch,
    sha: currentConfig.sha,
  })
}
