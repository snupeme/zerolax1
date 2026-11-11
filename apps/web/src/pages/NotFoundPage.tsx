import { Home, SearchX } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { LinkButton } from '../components/LinkButton';
import { EmptyState } from '../components/ui/feedback';

export function NotFoundPage() {
  const { t } = useI18n();

  return (
    <div className="animate-fade-in py-8">
      <EmptyState
        icon={<SearchX className="h-7 w-7" />}
        title={t('common.notFoundTitle')}
        message={t('common.notFoundText')}
        action={
          <LinkButton to="/" leftIcon={<Home className="h-4 w-4" />}>
            {t('common.backToHome')}
          </LinkButton>
        }
      />
    </div>
  );
}
