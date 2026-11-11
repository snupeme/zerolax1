import { FileText, Lock, ScrollText } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { PageHeader } from '../components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

const SECTIONS = [
  { title: 'offer.terms', text: 'offer.termsText', icon: FileText },
  { title: 'offer.privacy', text: 'offer.privacyText', icon: Lock },
  { title: 'offer.agreement', text: 'offer.agreementText', icon: ScrollText },
] as const;

export function OfferPage() {
  const { t } = useI18n();

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader title={t('offer.title')} subtitle={t('offer.subtitle')} />

      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <section.icon className="h-4 w-4 text-primary" />
              {t(section.title)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {t(section.text)}
            </p>
          </CardContent>
        </Card>
      ))}

      <p className="text-center text-xs text-muted-foreground">{t('offer.updated')}</p>
    </div>
  );
}
