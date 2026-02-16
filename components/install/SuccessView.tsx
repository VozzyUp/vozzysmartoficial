'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Copy, Check, ExternalLink, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StepCard } from './StepCard';
import { cn } from '@/lib/utils';
import { playComplete } from '@/hooks/useSoundFX';
import type { InstallData } from '@/lib/installer/types';

interface SuccessViewProps {
  name: string;
  data: InstallData;
}

/**
 * Sanitiza e extrai o primeiro nome.
 */
function sanitizeFirstName(fullName: string): string {
  const firstName = fullName.trim().split(/\s+/)[0] || '';
  const sanitized = firstName.slice(0, 30).replace(/[<>'"&]/g, '');
  return sanitized || 'Replicante';
}

/**
 * View de sucesso após instalação completa.
 * Tema Blade Runner - "Mais humano que humano"
 */
export function SuccessView({ name, data }: SuccessViewProps) {
  const firstName = sanitizeFirstName(name);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Som de conclusão ao montar
  useEffect(() => {
    playComplete();
  }, []);

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleGoToDashboard = () => {
    // Redireciona para o URL do Vercel
    window.open(`https://${data.githubRepoName}.vercel.app`, '_blank');
  };

  return (
    <StepCard glowColor="cyan">
      <div className="flex flex-col items-center text-center py-6">
        {/* Success icon with glow */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className={cn(
            'w-20 h-20 rounded-full',
            'bg-[var(--br-neon-cyan)]/20 border-2 border-[var(--br-neon-cyan)]',
            'flex items-center justify-center',
            'shadow-[0_0_40px_var(--br-neon-cyan)/0.5]'
          )}
        >
          <CheckCircle className="w-10 h-10 text-[var(--br-neon-cyan)]" />
        </motion.div>

        {/* Title - Blade Runner reference */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6 text-xl font-mono font-bold text-[var(--br-hologram-white)] uppercase tracking-wide"
        >
          Incubação Completa, {firstName}.
        </motion.h2>

        {/* Subtitle - Tyrell motto */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-2 text-sm text-[var(--br-neon-magenta)] font-mono italic"
        >
          &quot;Mais humano que humano&quot;
        </motion.p>

        {/* Installation Summary */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="mt-6 w-full"
        >
          <details className="w-full group" open>
            <summary className="flex items-center justify-center gap-1.5 text-sm font-mono text-[var(--br-neon-cyan)] cursor-pointer list-none mb-3">
              <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
              Resumo da Instalação
            </summary>
            
            <div className="space-y-3 text-left">
              {/* Link do Sistema - DESTAQUE */}
              <div className="p-4 rounded-lg bg-[var(--br-void-black)]/50 border-2 border-[var(--br-neon-cyan)]/50">
                <p className="text-xs font-mono text-[var(--br-neon-cyan)] font-bold mb-3 flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" />
                  ACESSO AO SISTEMA
                </p>
                <a
                  href={`https://${data.githubRepoName}.vercel.app`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm font-mono text-[var(--br-hologram-white)] hover:text-[var(--br-neon-cyan)] transition-colors break-all"
                >
                  https://{data.githubRepoName}.vercel.app
                </a>
              </div>

              {/* Credenciais de Acesso */}
              <div className="p-3 rounded-lg bg-[var(--br-void-black)]/50 border border-[var(--br-neon-magenta)]/30">
                <p className="text-xs font-mono text-[var(--br-neon-magenta)] font-bold mb-2">
                  🔐 CREDENCIAIS DE ACESSO
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-[var(--br-dust-gray)]">Email:</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-mono text-[var(--br-hologram-white)]">{data.email}</span>
                      <button
                        onClick={() => handleCopy(data.email, 'email')}
                        className="p-1 hover:bg-[var(--br-neon-cyan)]/10 rounded transition-colors"
                      >
                        {copiedField === 'email' ? (
                          <Check className="w-3 h-3 text-[var(--br-neon-cyan)]" />
                        ) : (
                          <Copy className="w-3 h-3 text-[var(--br-dust-gray)]" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-[var(--br-dust-gray)]">Senha:</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-mono text-[var(--br-hologram-white)]">••••••••</span>
                      <button
                        onClick={() => handleCopy(data.password, 'password')}
                        className="p-1 hover:bg-[var(--br-neon-cyan)]/10 rounded transition-colors"
                      >
                        {copiedField === 'password' ? (
                          <Check className="w-3 h-3 text-[var(--br-neon-cyan)]" />
                        ) : (
                          <Copy className="w-3 h-3 text-[var(--br-dust-gray)]" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </details>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="mt-6 w-full"
        >
          <Button
            size="lg"
            className={cn(
              'w-full font-mono uppercase tracking-wider',
              'bg-[var(--br-neon-cyan)] hover:bg-[var(--br-neon-cyan)]/80',
              'text-[var(--br-void-black)] font-bold',
              'shadow-[0_0_20px_var(--br-neon-cyan)/0.4]',
              'hover:shadow-[0_0_30px_var(--br-neon-cyan)/0.6]',
              'transition-all duration-200'
            )}
            onClick={handleGoToDashboard}
          >
            Iniciar Operações
          </Button>
        </motion.div>

        {/* Hint - Blade Runner style */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="mt-4 text-xs text-[var(--br-dust-gray)] font-mono"
        >
          Configure a API do WhatsApp em Configurações • Seu baseline foi registrado
        </motion.p>
      </div>
    </StepCard>
  );
}
