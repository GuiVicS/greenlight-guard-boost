import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, CreditCard } from "lucide-react";

interface CustomerFormProps {
  customerData: {
    name: string;
    email: string;
    cpf: string;
  };
  onChange: (data: { name: string; email: string; cpf: string }) => void;
  primaryColor: string;
}

export function CustomerForm({ customerData, onChange, primaryColor }: CustomerFormProps) {
  const formatCPF = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
    if (numbers.length <= 9) return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9, 11)}`;
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name" className="text-sm font-medium flex items-center gap-2">
          <User className="h-4 w-4" style={{ color: primaryColor }} />
          Nome completo
        </Label>
        <Input
          id="name"
          type="text"
          placeholder="ex: Maria de Almeida Cruz"
          value={customerData.name}
          onChange={(e) => onChange({ ...customerData, name: e.target.value })}
          className="h-12 rounded-xl border-border/50 focus:border-primary transition-colors"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
          <Mail className="h-4 w-4" style={{ color: primaryColor }} />
          E-mail
          <span className="text-xs text-muted-foreground font-normal">(Para envio do comprovante)</span>
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="ex: maria@gmail.com"
          value={customerData.email}
          onChange={(e) => onChange({ ...customerData, email: e.target.value })}
          className="h-12 rounded-xl border-border/50 focus:border-primary transition-colors"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cpf" className="text-sm font-medium flex items-center gap-2">
          <CreditCard className="h-4 w-4" style={{ color: primaryColor }} />
          CPF
        </Label>
        <Input
          id="cpf"
          type="text"
          placeholder="000.000.000-00"
          value={customerData.cpf}
          onChange={(e) => onChange({ ...customerData, cpf: formatCPF(e.target.value) })}
          maxLength={14}
          className="h-12 rounded-xl border-border/50 focus:border-primary transition-colors"
        />
      </div>
    </div>
  );
}
