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
 * Cria um único commit com múltiplos arquivos usando Git Database API
 * Isso evita múltiplos deployments no Vercel
 */
async function createSingleCommitWithMultipleFiles(params: {
  token: string
  owner: string
  repo: string
  branch: string
  files: Array<{ path: string; content: string }>
  message: string
}): Promise<{ sha: string; url: string }> {
  const { token, owner, repo, branch, files, message } = params
  const apiBase = `${GITHUB_API_BASE}/repos/${owner}/${repo}/git`

  try {
    // 1. Obter SHA do commit atual da branch
    const refResponse = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/ref/heads/${branch}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!refResponse.ok) {
      throw new Error(`Falha ao obter referência da branch: ${refResponse.status}`)
    }

    const refData = await refResponse.json()
    const parentSha = refData.object.sha

    // 2. Obter tree atual
    const treeResponse = await fetch(`${apiBase}/trees/${parentSha}?recursive=1`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!treeResponse.ok) {
      throw new Error(`Falha ao obter tree atual: ${treeResponse.status}`)
    }

    const treeData = await treeResponse.json()
    const baseTreeSha = treeData.sha

    // 3. Criar blobs para cada arquivo
    const blobShas: Array<{ path: string; sha: string; mode: string }> = []

    for (const file of files) {
      const contentBase64 = Buffer.from(file.content, 'utf8').toString('base64')

      const blobResponse = await fetch(`${apiBase}/blobs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: contentBase64,
          encoding: 'base64',
        }),
      })

      if (!blobResponse.ok) {
        throw new Error(`Falha ao criar blob para ${file.path}: ${blobResponse.status}`)
      }

      const blobData = await blobResponse.json()
      blobShas.push({
        path: file.path,
        sha: blobData.sha,
        mode: '100644', // Arquivo regular
      })
    }

    // 4. Criar nova tree com todos os arquivos
    // Usar base_tree para manter estrutura existente e apenas atualizar arquivos modificados
    const treeEntries: Array<{
      path: string
      mode: string
      type: string
      sha: string
    }> = []

    // Adicionar apenas os arquivos que estamos atualizando
    // O GitHub API automaticamente mantém os outros arquivos quando usamos base_tree
    for (const blob of blobShas) {
      treeEntries.push({
        path: blob.path,
        mode: blob.mode,
        type: 'blob',
        sha: blob.sha,
      })
    }

    const createTreeResponse = await fetch(`${apiBase}/trees`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeEntries,
      }),
    })

    if (!createTreeResponse.ok) {
      const errorData = await createTreeResponse.json().catch(() => ({}))
      throw new Error(`Falha ao criar tree: ${createTreeResponse.status} - ${JSON.stringify(errorData)}`)
    }

    const newTreeData = await createTreeResponse.json()
    const newTreeSha = newTreeData.sha

    // 5. Criar commit
    const commitResponse = await fetch(`${apiBase}/commits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        tree: newTreeSha,
        parents: [parentSha],
      }),
    })

    if (!commitResponse.ok) {
      const errorData = await commitResponse.json().catch(() => ({}))
      throw new Error(`Falha ao criar commit: ${commitResponse.status} - ${JSON.stringify(errorData)}`)
    }

    const commitData = await commitResponse.json()

    // 6. Atualizar referência da branch
    const updateRefResponse = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sha: commitData.sha,
      }),
    })

    if (!updateRefResponse.ok) {
      throw new Error(`Falha ao atualizar referência: ${updateRefResponse.status}`)
    }

    return {
      sha: commitData.sha,
      url: commitData.html_url,
    }
  } catch (error) {
    console.error('[createSingleCommitWithMultipleFiles] Erro:', error)
    throw error
  }
}

/**
 * Atualiza múltiplos arquivos no GitHub em um único commit
 * Retorna informações do commit único criado
 */
export async function updateFilesViaGitHub(params: {
  token: string
  owner: string
  repo: string
  branch?: string
  files: GitHubFileCommit[]
  version?: string
}): Promise<{ commit: { sha: string; url: string }; filesUpdated: number }> {
  const branch = params.branch || 'main'
  const version = params.version || ''

  // Usar mensagem única para todos os arquivos
  const commitMessage = version
    ? `chore: atualizar arquivos para versão ${version}`
    : `chore: atualizar ${params.files.length} arquivo(s)`

  // Preparar arquivos para commit único
  const filesToCommit = params.files.map((f) => ({
    path: f.path,
    content: f.content,
  }))

  try {
    const commitResult = await createSingleCommitWithMultipleFiles({
      token: params.token,
      owner: params.owner,
      repo: params.repo,
      branch,
      files: filesToCommit,
      message: commitMessage,
    })

    return {
      commit: commitResult,
      filesUpdated: params.files.length,
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido'
    throw new Error(`Falha ao atualizar arquivos: ${errorMsg}`)
  }
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
