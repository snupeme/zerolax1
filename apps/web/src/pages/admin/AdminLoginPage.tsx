import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Lock } from 'lucide-react';
import type { TranslationKey } from '@zerolax/shared';
import { useAdminAuth } from '../../auth/AdminAuthProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { errorKey } from '../../lib/errors';
import { Brand } from '../../components/Brand';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Field, Input } from '../../components/ui/input';

export function AdminLoginPage() {
  const { t } = useI18n();
  const { isAuthenticated, signIn } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<TranslationKey | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to={from} replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Brand size="lg" showTagline />
          <LanguageSwitcher compact persist={false} />
        </div>
        <Card className="shadow-glow">
          <CardHeader>
            <div className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <Lock className="h-5 w-5" />
            </div>
            <CardTitle className="text-xl">{t('admin.adminLogin')}</CardTitle>
            <CardDescription>{t('admin.adminLoginDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label={t('admin.email')} htmlFor="admin-email">
                <Input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@zerolax.uz"
                  autoComplete="username"
                  required
                  autoFocus
                />
              </Field>
              <Field
                label={t('admin.password')}
                htmlFor="admin-password"
                error={error ? t(error) : null}
              >
                <Input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={loading}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                {t('admin.signIn')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
