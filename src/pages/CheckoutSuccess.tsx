import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const returnUrl = searchParams.get("return_url");
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    console.log("Payment completed, session:", sessionId);
  }, [sessionId]);

  // Auto-redirect countdown
  useEffect(() => {
    if (!returnUrl) return;
    
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.href = decodeURIComponent(returnUrl);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [returnUrl]);

  const handleReturn = () => {
    if (returnUrl) {
      window.location.href = decodeURIComponent(returnUrl);
    } else {
      window.close();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardContent className="pt-8 pb-8 text-center space-y-6">
          <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="h-10 w-10 text-green-500" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              Pagamento Confirmado!
            </h1>
            <p className="text-muted-foreground">
              Seu pagamento foi processado com sucesso. O site será desbloqueado automaticamente.
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-left space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Pagamento aprovado</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Recibo enviado por e-mail</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Site desbloqueado</span>
            </div>
          </div>

          {returnUrl && (
            <p className="text-sm text-muted-foreground">
              Redirecionando em {countdown} segundos...
            </p>
          )}

          <Button
            onClick={handleReturn}
            className="w-full"
          >
            {returnUrl ? (
              <>
                Voltar ao site
                <ExternalLink className="h-4 w-4 ml-2" />
              </>
            ) : (
              <>
                Fechar esta página
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
