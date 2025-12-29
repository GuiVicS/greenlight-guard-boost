import { Check } from "lucide-react";

interface CheckoutTimelineProps {
  currentStep: number;
  primaryColor: string;
  isDarkTheme?: boolean;
}

export function CheckoutTimeline({ currentStep, primaryColor, isDarkTheme = false }: CheckoutTimelineProps) {
  const steps = [
    { number: 1, label: "Identificação" },
    { number: 2, label: "Pagamento" },
    { number: 3, label: "Confirmação" },
  ];

  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-center">
        {steps.map((step, index) => (
          <div key={step.number} className="flex items-center">
            {/* Step Circle */}
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                  currentStep > step.number
                    ? "text-white"
                    : currentStep === step.number
                    ? "text-white shadow-lg"
                    : isDarkTheme
                    ? "bg-slate-700 text-slate-400 border-2 border-slate-600"
                    : "bg-muted text-muted-foreground border-2 border-border"
                }`}
                style={{
                  backgroundColor:
                    currentStep >= step.number ? primaryColor : undefined,
                  boxShadow:
                    currentStep === step.number
                      ? `0 0 20px ${primaryColor}40`
                      : undefined,
                }}
              >
                {currentStep > step.number ? (
                  <Check className="h-5 w-5" />
                ) : (
                  step.number
                )}
              </div>
              <span
                className={`mt-2 text-xs font-medium transition-all duration-300 ${
                  currentStep >= step.number
                    ? isDarkTheme
                      ? "text-white"
                      : "text-foreground"
                    : isDarkTheme
                    ? "text-slate-500"
                    : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div
                className={`w-16 sm:w-24 h-1 mx-2 rounded-full transition-all duration-500 ${
                  currentStep > step.number
                    ? ""
                    : isDarkTheme
                    ? "bg-slate-700"
                    : "bg-muted"
                }`}
                style={{
                  backgroundColor:
                    currentStep > step.number ? primaryColor : undefined,
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
