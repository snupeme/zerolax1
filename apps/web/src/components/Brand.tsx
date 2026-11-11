import { useI18n } from '../i18n/I18nProvider';
import { cn } from '../lib/utils';
import {useQuery} from '@tanstack/react-query';
import {request} from '../lib/api';

export function Brand({
  className,
  size = 'md',
  showTagline = false,
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
}) {
  const { t } = useI18n();
  const config=useQuery({queryKey:['public-platform'],queryFn:()=>request<{name:string;logoUrl:string}>('/api/content/config',{auth:'none'}),staleTime:60000});
  const markSizes = {
    sm: 'h-7 w-7 text-sm rounded-lg',
    md: 'h-9 w-9 text-base rounded-xl',
    lg: 'h-12 w-12 text-xl rounded-2xl',
  };
  const textSizes = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' };
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'grid shrink-0 place-items-center brand-gradient font-extrabold text-surface-ink shadow-glow',
          markSizes[size],
        )}
        aria-hidden
      >
        {config.data?.logoUrl?<img src={config.data.logoUrl} alt="" className="h-full w-full rounded-[inherit] object-contain"/>:'Z'}
      </span>
      <div className="leading-none">
        <span className={cn('font-extrabold tracking-tight brand-text-gradient', textSizes[size])}>
          {config.data?.name??'ZEROLAX'}
        </span>
        {showTagline ? (
          <p className="mt-1 text-[11px] font-medium text-muted-foreground">{t('common.tagline')}</p>
        ) : null}
      </div>
    </div>
  );
}
