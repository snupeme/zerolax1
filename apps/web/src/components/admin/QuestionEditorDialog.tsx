import { useEffect, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import {
  questionInputSchema,
  type AdminTestQuestion,
  type Difficulty,
  type TranslationKey,
} from '@zerolax/shared';
import { useI18n } from '../../i18n/I18nProvider';
import type { QuestionInput } from '../../lib/api';
import { cn } from '../../lib/utils';
import { Dialog } from '../ui/dialog';
import { Button } from '../ui/button';
import { Field, Input, Select, Textarea } from '../ui/input';
import { Badge } from '../ui/badge';

const EMPTY_OPTION = { textUz: '', textRu: '', textEn: '' };

interface FormState {
  textUz: string;
  textRu: string;
  textEn: string;
  explanationUz: string;
  explanationRu: string;
  explanationEn: string;
  difficulty: Difficulty;
  coins: string;
  imageUrl: string;
  correctOptionIndex: number;
  options: Array<{ textUz: string; textRu: string; textEn: string }>;
}

function emptyForm(): FormState {
  return {
    textUz: '',
    textRu: '',
    textEn: '',
    explanationUz: '',
    explanationRu: '',
    explanationEn: '',
    difficulty: 'medium',
    coins: '2',
    imageUrl: '',
    correctOptionIndex: 0,
    options: [EMPTY_OPTION, EMPTY_OPTION, EMPTY_OPTION, EMPTY_OPTION].map((option) => ({ ...option })),
  };
}

function fromQuestion(question: AdminTestQuestion): FormState {
  return {
    textUz: question.textUz,
    textRu: question.textRu,
    textEn: question.textEn,
    explanationUz: question.explanationUz ?? '',
    explanationRu: question.explanationRu ?? '',
    explanationEn: question.explanationEn ?? '',
    difficulty: question.difficulty,
    coins: String(question.coins),
    imageUrl: question.imageUrl ?? '',
    correctOptionIndex: question.correctOptionIndex,
    options: [0, 1, 2, 3].map((index) => {
      const option = question.options.find((item) => item.position === index + 1) ?? question.options[index];
      return {
        textUz: option?.textUz ?? '',
        textRu: option?.textRu ?? '',
        textEn: option?.textEn ?? '',
      };
    }),
  };
}

export function QuestionEditorDialog({
  open,
  onClose,
  initial,
  onSubmit,
  saving,
  error,
}: {
  open: boolean;
  onClose: () => void;
  initial: AdminTestQuestion | null;
  onSubmit: (input: QuestionInput) => void;
  saving: boolean;
  error: TranslationKey | null;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [validationError, setValidationError] = useState<TranslationKey | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(initial ? fromQuestion(initial) : emptyForm());
    setValidationError(null);
  }, [open, initial]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setValidationError(null);
  }

  function updateOption(index: number, language: 'textUz' | 'textRu' | 'textEn', value: string) {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, [language]: value } : option,
      ),
    }));
    setValidationError(null);
  }

  function submit() {
    const input = {
      textUz: form.textUz,
      textRu: form.textRu,
      textEn: form.textEn,
      explanationUz: form.explanationUz.trim() || null,
      explanationRu: form.explanationRu.trim() || null,
      explanationEn: form.explanationEn.trim() || null,
      difficulty: form.difficulty,
      coins: Number(form.coins),
      imageUrl: form.imageUrl.trim() || null,
      correctOptionIndex: form.correctOptionIndex,
      options: form.options,
    };
    const parsed = questionInputSchema.safeParse(input);
    if (!parsed.success) {
      setValidationError('admin.requiredFields');
      return;
    }
    onSubmit(parsed.data as QuestionInput);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? t('admin.editQuestion') : t('admin.addQuestion')}
      description={t('admin.requiredFields')}
      className="sm:max-w-3xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={saving} leftIcon={<Check className="h-4 w-4" />}>
            {t('admin.saveQuestion')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {validationError ?? error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
            {t(validationError ?? error ?? 'admin.requiredFields')}
          </p>
        ) : null}

        <section>
          <h3 className="mb-2 text-sm font-bold">{t('admin.questionText')}</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label={<Badge variant="outline">UZ</Badge>}>
              <Textarea
                value={form.textUz}
                onChange={(event) => update('textUz', event.target.value)}
                rows={3}
              />
            </Field>
            <Field label={<Badge variant="outline">RU</Badge>}>
              <Textarea
                value={form.textRu}
                onChange={(event) => update('textRu', event.target.value)}
                rows={3}
              />
            </Field>
            <Field label={<Badge variant="outline">EN</Badge>}>
              <Textarea
                value={form.textEn}
                onChange={(event) => update('textEn', event.target.value)}
                rows={3}
              />
            </Field>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-bold">{t('admin.option')}</h3>
          <div className="space-y-3">
            {form.options.map((option, index) => (
              <div key={index} className="rounded-xl border border-border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-muted-foreground">
                    {t('admin.option', { i: index + 1 })}
                  </span>
                  <button
                    type="button"
                    onClick={() => update('correctOptionIndex', index)}
                    aria-pressed={form.correctOptionIndex === index}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors',
                      form.correctOptionIndex === index
                        ? 'bg-success/15 text-success'
                        : 'bg-muted text-muted-foreground hover:bg-muted/70',
                    )}
                  >
                    {form.correctOptionIndex === index ? <Check className="h-3 w-3" /> : null}
                    {t('admin.correctAnswer')}
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input
                    value={option.textUz}
                    placeholder="UZ"
                    onChange={(event) => updateOption(index, 'textUz', event.target.value)}
                  />
                  <Input
                    value={option.textRu}
                    placeholder="RU"
                    onChange={(event) => updateOption(index, 'textRu', event.target.value)}
                  />
                  <Input
                    value={option.textEn}
                    placeholder="EN"
                    onChange={(event) => updateOption(index, 'textEn', event.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Plus className="h-3.5 w-3.5" />
            {t('admin.correctAnswer')}:{' '}
            <strong className="text-success">{t('admin.option', { i: form.correctOptionIndex + 1 })}</strong>
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-bold">{t('admin.explanation')}</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label={<Badge variant="outline">UZ</Badge>}>
              <Textarea
                value={form.explanationUz}
                onChange={(event) => update('explanationUz', event.target.value)}
                rows={2}
              />
            </Field>
            <Field label={<Badge variant="outline">RU</Badge>}>
              <Textarea
                value={form.explanationRu}
                onChange={(event) => update('explanationRu', event.target.value)}
                rows={2}
              />
            </Field>
            <Field label={<Badge variant="outline">EN</Badge>}>
              <Textarea
                value={form.explanationEn}
                onChange={(event) => update('explanationEn', event.target.value)}
                rows={2}
              />
            </Field>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <Field label={t('admin.difficulty')}>
            <Select
              value={form.difficulty}
              onChange={(event) => update('difficulty', event.target.value as Difficulty)}
            >
              <option value="easy">{t('difficulty.easy')}</option>
              <option value="medium">{t('difficulty.medium')}</option>
              <option value="hard">{t('difficulty.hard')}</option>
            </Select>
          </Field>
          <Field label={t('admin.coinsPerQuestion')}>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.coins}
              onChange={(event) => update('coins', event.target.value)}
            />
          </Field>
          <Field label={t('admin.imageUrl')}>
            <Input
              value={form.imageUrl}
              placeholder="https://"
              onChange={(event) => update('imageUrl', event.target.value)}
            />
          </Field>
        </section>
      </div>
    </Dialog>
  );
}
