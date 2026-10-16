import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ info?: string }> }) {
  const { info } = await searchParams;
  const notice = info === "expired" ? "Ce lien a expiré ou a déjà été utilisé. Demande-en un nouveau." : undefined;
  return <AuthShell title="Mot de passe oublié"><ForgotPasswordForm notice={notice} /></AuthShell>;
}
