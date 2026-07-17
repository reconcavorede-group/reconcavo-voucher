import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

// Tela de login do painel. Usa a conta única de admin no Supabase Auth.
// A sessão autenticada é o que ativa as policies de admin na RLS — sem login,
// o banco recusa qualquer operação administrativa.
export function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      toast.error("E-mail ou senha inválidos.");
      return;
    }
    // O onAuthStateChange no AdminLayout troca a tela automaticamente.
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm p-6 space-y-5">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Lock className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-foreground">Painel Administrativo</h1>
            <p className="text-xs text-muted-foreground">Acesso restrito</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="admin-email" className="text-xs">E-mail</Label>
            <Input
              id="admin-email" type="email" autoComplete="username"
              value={email} onChange={(e) => setEmail(e.target.value)} required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="admin-password" className="text-xs">Senha</Label>
            <Input
              id="admin-password" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Entrar
          </Button>
        </form>
      </Card>
    </div>
  );
}
