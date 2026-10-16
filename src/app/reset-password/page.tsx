import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return <AuthShell title="Nouveau mot de passe"><ResetPasswordForm /></AuthShell>;
}
