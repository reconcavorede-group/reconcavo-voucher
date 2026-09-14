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
  const [mode, setMode] = useState<"login" | "forgot">("login");
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

  // Envia o e-mail de redefinição para a conta informada. O Supabase só dispara
  // se o e-mail existir; por segurança mostramos sempre a mesma mensagem (não
  // revela se a conta existe). O link leva a /reset-senha.
  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-senha`,
    });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível enviar: " + error.message);
      return;
    }
    toast.success("Se este e-mail estiver cadastrado, enviamos um link de redefinição.");
    setMode("login");
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
            <p className="text-xs text-muted-foreground">
              {mode === "login" ? "Acesso restrito" : "Recuperar acesso"}
            </p>
          </div>
        </div>

        {mode === "login" ? (
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
            <button type="button" onClick={() => setMode("forgot")}
              className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline">
              Esqueci minha senha
            </button>
          </form>
        ) : (
          <form onSubmit={sendReset} className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Informe o e-mail cadastrado. Enviaremos um link para você criar uma nova senha.
            </p>
            <div className="space-y-1">
              <Label htmlFor="reset-email" className="text-xs">E-mail</Label>
              <Input
                id="reset-email" type="email" autoComplete="username"
                value={email} onChange={(e) => setEmail(e.target.value)} required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enviar link de redefinição
            </Button>
            <button type="button" onClick={() => setMode("login")}
              className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline">
              Voltar ao login
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}
