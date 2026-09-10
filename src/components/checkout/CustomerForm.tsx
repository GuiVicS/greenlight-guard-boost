import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, FileText } from "lucide-react";
import { getCountryConfig } from "@/lib/checkout-utils";

interface CustomerFormProps {
  customerData: {
    name: string;
    email: string;
    document: string;
  };
  onChange: (data: { name: string; email: string; document: string }) => void;
  primaryColor: string;
  isDarkTheme?: boolean;
  country?: string;
}

export function CustomerForm({ customerData, onChange, primaryColor, isDarkTheme = false, country = 'BR' }: CustomerFormProps) {
  const config = getCountryConfig(country);
  
  const handleDocumentChange = (value: string) => {
    const formattedValue = config.documentMask ? config.documentMask(value) : value;
    onChange({ ...customerData, document: formattedValue });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name" className={`flex items-center gap-2 text-sm font-medium ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
          <User className="h-4 w-4" style={{ color: primaryColor }} />
          {config.locale.startsWith('pt') ? 'Nome completo' : config.locale.startsWith('es') ? 'Nombre completo' : 'Full name'}
        </Label>
        <Input
          id="name"
          placeholder={config.namePlaceholder}
          value={customerData.name}
          onChange={(e) => onChange({ ...customerData, name: e.target.value })}
          className={`h-12 text-base rounded-xl border-2 transition-all focus:ring-0 ${isDarkTheme 
            ? 'bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-slate-400' 
            : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-400'}`}
          style={{ 
            '--tw-ring-color': primaryColor,
          } as React.CSSProperties}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email" className={`flex items-center gap-2 text-sm font-medium ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
          <Mail className="h-4 w-4" style={{ color: primaryColor }} />
          E-mail
        </Label>
        <Input
          id="email"
          type="email"
          placeholder={config.locale.startsWith('pt') ? 'seu@email.com' : config.locale.startsWith('es') ? 'tu@correo.com' : 'your@email.com'}
          value={customerData.email}
          onChange={(e) => onChange({ ...customerData, email: e.target.value })}
          className={`h-12 text-base rounded-xl border-2 transition-all focus:ring-0 ${isDarkTheme 
            ? 'bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-slate-400' 
            : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-400'}`}
        />
      </div>

      {config.requiresDocument !== false && (
      <div className="space-y-2">
        <Label htmlFor="document" className={`flex items-center gap-2 text-sm font-medium ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
          <FileText className="h-4 w-4" style={{ color: primaryColor }} />
          {config.documentLabel}
        </Label>
        <Input
          id="document"
          placeholder={config.documentPlaceholder}
          value={customerData.document}
          onChange={(e) => handleDocumentChange(e.target.value)}
          className={`h-12 text-base rounded-xl border-2 transition-all focus:ring-0 ${isDarkTheme 
            ? 'bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-slate-400' 
            : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-400'}`}
        />
      </div>
      )}
    </div>
  );
}
