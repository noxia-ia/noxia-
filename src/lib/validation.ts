const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PASSWORD_MIN = 8;
export function validateLogin(email: string, password: string): string | null {
  if (!EMAIL.test(email.trim())) return "Adresse email invalide.";
  if (!password) return "Le mot de passe est obligatoire.";
  return null;
}
export function validateRegister(name: string, email: string, password: string, confirm: string): string | null {
  if (name.trim().length < 2) return "Le nom doit contenir au moins 2 caractères.";
  if (!EMAIL.test(email.trim())) return "Adresse email invalide.";
  if (password.length < PASSWORD_MIN) return `Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`;
  if (password !== confirm) return "Les mots de passe ne correspondent pas.";
  return null;
}
export function authErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "Email ou mot de passe incorrect.";
  if (m.includes("not confirmed")) return "Confirme ton email avant de te connecter.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Cette adresse email est déjà utilisée.";
  if (m.includes("rate limit") || m.includes("too many")) return "Trop de tentatives. Réessaie dans quelques minutes.";
  if (m.includes("weak")) return "Mot de passe trop faible : ajoute des chiffres, des majuscules ou des symboles.";
  if (m.includes("at least") || m.includes("password")) return `Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`;
  if (m.includes("database error")) return "Impossible de créer le compte pour le moment. Réessaie plus tard.";
  if (m.includes("fetch") || m.includes("network")) return "Connexion impossible. Vérifie ta connexion internet.";
  if (m.includes("email")) return "Adresse email invalide.";
  return "Une erreur est survenue. Réessaie.";
}
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
