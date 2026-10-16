import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ info?: string }> }) {
  const { info } = await searchParams;
  const notice = info === "confirm" ? "Si tu viens de confirmer ton email, connecte-toi avec ton mot de passe." : undefined;
  return <AuthShell title="Connexion"><LoginForm notice={notice} /></AuthShell>;
}
