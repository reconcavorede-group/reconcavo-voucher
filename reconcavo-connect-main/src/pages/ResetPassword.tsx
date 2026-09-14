import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";

// Página de redefinição de senha do admin.
// O usuário chega aqui pelo link do e-mail de recuperação (Supabase Auth).
// O client detecta o token na URL (detectSessionInUrl) e cria uma sessão de
// recuperação — só então liberamos o formulário de nova senha.
export default function ResetPassword() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false); // sessão de recuperação válida?
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Redefinir senha — Recôncavo Voucher";
    // O evento PASSWORD_RECOVERY (ou uma sessão presente) confirma que o link
    // é válido. Escutamos os dois caminhos para evitar corrida de tempo.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setReady(true);
        setChecking(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      setChecking(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("A senha deve ter pelo menos 8 caracteres.");
    if (password !== confirm) return toast.error("As senhas não coincidem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível redefinir: " + error.message);
      return;
    }
    toast.success("Senha redefinida com sucesso!");
    navigate("/admin", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm p-6 space-y-5">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <KeyRound className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-foreground">Redefinir senha</h1>
            <p className="text-xs text-muted-foreground">Escolha uma nova senha de acesso</p>
          </div>
        </div>

        {checking && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {!checking && !ready && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Link inválido ou expirado. Volte à tela de login e peça um novo link de redefinição.
            </p>
            <Button className="w-full" onClick={() => navigate("/admin", { replace: true })}>
              Voltar ao login
            </Button>
          </div>
        )}

        {!checking && ready && (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="new-password" className="text-xs">Nova senha</Label>
              <Input
                id="new-password" type="password" autoComplete="new-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="mínimo 8 caracteres" required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm-password" className="text-xs">Confirme a nova senha</Label>
              <Input
                id="confirm-password" type="password" autoComplete="new-password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)} required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar nova senha
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
