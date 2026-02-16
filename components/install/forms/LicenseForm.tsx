import { useState } from 'react';
import { Key } from 'lucide-react';
import { StepCard } from '../StepCard';
import { InstallData, actions } from '@/lib/installer/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LicenseFormProps {
  data: InstallData;
  dispatch: React.Dispatch<any>;
}

export function LicenseForm({ data, dispatch }: LicenseFormProps) {
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleValidate = async () => {
    if (!data.licenseCode || data.licenseCode.length < 5) {
      setError('Por favor, insira um código de licença válido.');
      return;
    }

    setIsValidating(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/installer/license/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: data.licenseCode }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Erro ao validar licença');
      }

      if (result.valid) {
        setSuccess(`Licença validada com sucesso! Bem-vindo, ${result.customerName}.`);
        // Aguarda um pouco para o usuário ver a mensagem de sucesso antes de avançar
        setTimeout(() => {
          dispatch(actions.submitStep({ licenseCode: data.licenseCode }));
        }, 1500);
      } else {
        throw new Error('Licença inválida');
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao conectar ao servidor de validação');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <StepCard 
      glowColor="cyan"
    >
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-14 h-14 rounded-full bg-[var(--br-deep-navy)] border border-[var(--br-neon-cyan)]/30 flex items-center justify-center mb-4">
           <Key className="w-7 h-7 text-[var(--br-neon-cyan)]" />
        </div>
        <h2 className="text-xl font-bold tracking-wide text-[var(--br-hologram-white)] uppercase">
          Ativação do Produto
        </h2>
        <p className="mt-1 text-sm text-[var(--br-muted-cyan)] font-mono">
          Insira sua chave de licença para iniciar a instalação
        </p>
      </div>

      <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="licenseCode" className="text-[var(--br-hologram-white)]">
              Código da Licença
            </Label>
            <div className="flex gap-2">
              <Input
                id="licenseCode"
                value={data.licenseCode}
                onChange={(e) => {
                  setError(null);
                  dispatch(actions.updateData({ licenseCode: e.target.value.toUpperCase() }));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleValidate();
                  }
                }}
                placeholder="Ex: VOZ-XXXX-YYYY"
                className="font-mono text-lg tracking-widest uppercase bg-black/50 border-[var(--br-neon-cyan)]/30 focus:border-[var(--br-neon-cyan)] text-[var(--br-hologram-white)]"
                autoComplete="off"
                disabled={isValidating}
              />
            </div>
            {error && (
              <p className="text-sm text-[var(--br-neon-orange)] animate-pulse">
                ⚠ {error}
              </p>
            )}
            {success && (
              <p className="text-sm text-[var(--br-neon-green)]">
                ✓ {success}
              </p>
            )}
            <p className="text-xs text-[var(--br-muted-cyan)] mt-2">
              Seu código foi enviado por email após a confirmação do pagamento.
            </p>
          </div>

          <div className="pt-4 flex justify-end">
            <Button 
              onClick={handleValidate} 
              disabled={isValidating || !data.licenseCode}
              className="w-full sm:w-auto bg-[var(--br-neon-cyan)] text-black hover:bg-[var(--br-neon-cyan)]/80 font-bold"
            >
              {isValidating ? 'Validando...' : 'Validar Licença'}
            </Button>
          </div>
        </div>
    </StepCard>
  );
}
