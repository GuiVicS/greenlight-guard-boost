import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerForm } from "./CustomerForm";
import { ArrowRight, User } from "lucide-react";

interface StepIdentificationProps {
  customerData: {
    name: string;
    email: string;
    document: string;
  };
  onChange: (data: { name: string; email: string; document: string }) => void;
  onNext: () => void;
  primaryColor: string;
  isDarkTheme?: boolean;
  country: string;
}

export function StepIdentification({
  customerData,
  onChange,
  onNext,
  primaryColor,
  isDarkTheme = false,
  country,
}: StepIdentificationProps) {
  const isValid = customerData.name.trim() && customerData.email.trim() && customerData.document.trim();

  return (
    <Card className={`shadow-lg border-0 overflow-hidden ${isDarkTheme ? 'bg-slate-800/90' : ''}`}>
      <CardHeader className={`pb-4 ${isDarkTheme 
        ? 'bg-gradient-to-r from-slate-800 to-slate-700' 
        : 'bg-gradient-to-r from-slate-50 to-white'}`}
      >
        <div className="flex items-center gap-4">
          <div 
            className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md"
            style={{ backgroundColor: primaryColor }}
          >
            <User className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className={`text-xl ${isDarkTheme ? 'text-white' : ''}`}>
              {country === 'BR' ? 'Seus Dados' : 'Your Information'}
            </CardTitle>
            <p className={`text-sm mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-muted-foreground'}`}>
              {country === 'BR' 
                ? 'Preencha seus dados para continuar'
                : 'Fill in your details to continue'}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        <CustomerForm 
          customerData={customerData}
          onChange={onChange}
          primaryColor={primaryColor}
          isDarkTheme={isDarkTheme}
          country={country}
        />

        <Button
          onClick={onNext}
          disabled={!isValid}
          className="w-full h-14 text-base font-semibold rounded-xl shadow-lg transition-all hover:shadow-xl disabled:opacity-50"
          style={{ backgroundColor: primaryColor }}
        >
          {country === 'BR' ? 'Continuar para Pagamento' : 'Continue to Payment'}
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </CardContent>
    </Card>
  );
}
