import { Clock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatBRL } from "@/lib/voucher";

interface PlanCardProps {
  name: string;
  price: number;
  durationMinutes: number;
  highlight?: boolean;
  onSelect: () => void;
}

export function PlanCard({ name, price, durationMinutes, highlight, onSelect }: PlanCardProps) {
  return (
    <Card
      className={`relative overflow-hidden bg-gradient-card border-2 transition-smooth hover:-translate-y-2 hover:shadow-elegant group ${
        highlight ? "border-accent shadow-glow" : "border-border hover:border-primary/40"
      }`}
    >
      {highlight && (
        <div className="absolute top-0 right-0 bg-accent text-accent-foreground text-xs font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1">
          <Zap className="h-3 w-3" /> POPULAR
        </div>
      )}
      <div className="p-6 flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-primary flex items-center justify-center mb-4 group-hover:animate-float">
          <Clock className="h-7 w-7 text-primary-foreground" />
        </div>
        <h3 className="text-xl font-bold text-foreground">{name}</h3>
        <p className="text-xs text-muted-foreground mt-1">Acesso completo</p>
        <div className="my-6">
          <span className="text-4xl font-extrabold bg-gradient-primary bg-clip-text text-transparent">
            {formatBRL(price)}
          </span>
        </div>
        <Button onClick={onSelect} variant="hero" className="w-full">
          Solicitar Acesso
        </Button>
      </div>
    </Card>
  );
}
