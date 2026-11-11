import { LANGUAGES, LANGUAGE_FLAGS, LANGUAGE_LABELS, type Language } from '@zerolax/shared';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import {useQuery} from '@tanstack/react-query';
import {request} from '../lib/api';
import {useEffect} from 'react';

export function LanguageSwitcher({
  className,
  compact = false,
  persist = true,
}: {
  className?: string;
  compact?: boolean;
  persist?: boolean;
}) {
  const { language, setLanguage, t } = useI18n();
  const config=useQuery({queryKey:['public-platform'],queryFn:()=>request<{languages?:Language[]}>('/api/content/config',{auth:'none'}),staleTime:60000});
  useEffect(()=>{if(config.data?.languages?.length&&!config.data.languages.includes(language))setLanguage(config.data.languages[0]);},[config.data?.languages,language,setLanguage]);
  const { profile, setProfile } = useAuth();

  const update = useMutation({
    mutationFn: (next: Language) => api.user.updateMe({ language: next }),
    onSuccess: (data) => setProfile(data.profile),
  });

  function handleChange(next: Language) {
    setLanguage(next);
    if (persist && profile) update.mutate(next);
  }

  return (
    <select
      aria-label={t('common.language')}
      value={language}
      onChange={(event) => handleChange(event.target.value as Language)}
      className={cn(
        'cursor-pointer rounded-lg border border-border bg-card font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        compact ? 'h-9 px-2 text-xs' : 'h-10 px-3 text-sm',
        className,
      )}
    >
      {LANGUAGES.filter(code=>!config.data?.languages||config.data.languages.includes(code)).map((code) => (
        <option key={code} value={code}>
          {LANGUAGE_FLAGS[code]} {compact ? code.toUpperCase() : LANGUAGE_LABELS[code]}
        </option>
      ))}
    </select>
  );
}
