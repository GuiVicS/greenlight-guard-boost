import { useMemo, useState } from 'react';
import { CheckCircle2, Circle, ChevronDown, ChevronUp, ExternalLink, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface WizardStep {
  title: string;
  description: string;
  done: boolean;
  /** Optional external helper link (e.g. gateway dashboard) */
  link?: { label: string; url: string };
  /** Optional value to display/copy, like a webhook URL */
  code?: string;
}

interface IntegrationWizardProps {
  title: string;
  subtitle?: string;
  steps: WizardStep[];
  className?: string;
}

export function IntegrationWizard({ title, subtitle, steps, className }: IntegrationWizardProps) {
  const completed = steps.filter(s => s.done).length;
  const total = steps.length;
  const allDone = completed === total && total > 0;
  const [open, setOpen] = useState(!allDone);

  const currentIndex = useMemo(() => {
    const idx = steps.findIndex(s => !s.done);
    return idx === -1 ? total - 1 : idx;
  }, [steps, total]);

  const progress = total ? Math.round((completed / total) * 100) : 0;

  return (
    <div className={cn('glass-card p-6 space-y-4', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-4 text-left"
      >
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
          allDone ? 'bg-primary/20' : 'bg-warning/20'
        )}>
          {allDone ? (
            <CheckCircle2 className="w-5 h-5 text-primary" />
          ) : (
            <Sparkles className="w-5 h-5 text-warning" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">
            {subtitle ?? (allDone
              ? 'Tudo pronto! Sua integração está configurada.'
              : `Siga o passo a passo — ${completed} de ${total} concluídos`)}
          </p>
          <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', allDone ? 'bg-primary' : 'bg-warning')}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        {open ? (
          <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        )}
      </button>

      {open && (
        <ol className="space-y-3 pt-2 border-t border-border">
          {steps.map((step, i) => {
            const isCurrent = i === currentIndex && !step.done;
            return (
              <li
                key={step.title}
                className={cn(
                  'flex gap-3 rounded-lg p-3 transition-colors',
                  isCurrent ? 'bg-muted/50 ring-1 ring-primary/30' : 'bg-muted/20'
                )}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {step.done ? (
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  ) : (
                    <Circle className={cn('w-5 h-5', isCurrent ? 'text-primary' : 'text-muted-foreground')} />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className={cn(
                    'text-sm font-medium',
                    step.done ? 'text-muted-foreground line-through' : 'text-foreground'
                  )}>
                    {i + 1}. {step.title}
                  </p>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                  {step.code && (
                    <div className="flex items-center gap-2 pt-1">
                      <code className="text-xs text-primary break-all bg-muted/40 rounded px-2 py-1 flex-1">
                        {step.code}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => navigator.clipboard.writeText(step.code as string)}
                      >
                        Copiar
                      </Button>
                    </div>
                  )}
                  {step.link && (
                    <a
                      href={step.link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {step.link.label} <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
