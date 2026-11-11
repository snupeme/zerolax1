import { useState } from "react";
import type { LearningExam } from "@zerolax/shared";
import { control, useControlWords, toast } from "../../lib/admin-control";
import { useLearningWords } from "../../lib/learning";
import { Field } from "./ControlUi";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
export function ExamRuleEditor({ exam }: { exam: LearningExam }) {
  const w = useControlWords();
  const l = useLearningWords();
  const [passing, setPassing] = useState(exam.passing_score?.toString() ?? "");
  const [attempts, setAttempts] = useState(exam.max_attempts?.toString() ?? "");
  const [useDistribution, setUseDistribution] = useState(
    !!exam.difficulty_distribution,
  );
  const [distribution, setDistribution] = useState(
    exam.difficulty_distribution ?? { easy: 0, medium: 0, hard: 0 },
  );
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3 rounded-xl border bg-card p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await control(
            `/exams/${exam.id}/rules`,
            {
              passingScore: passing ? Number(passing) : null,
              maxAttempts: attempts ? Number(attempts) : null,
              distribution: useDistribution ? distribution : null,
            },
            "PUT",
          );
          toast(w.saved);
        } catch (error) {
          toast((error as Error).message, true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="font-semibold">
        {l[exam.kind]} {exam.block_number ?? ""}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {exam.kind !== "final" && (
          <Field label={w.minScore}>
            <Input
              type="number"
              min={1}
              max={100}
              value={passing}
              onChange={(e) => setPassing(e.target.value)}
            />
          </Field>
        )}
        <Field label={l.maxAttempts}>
          <Input
            type="number"
            min={1}
            max={10}
            value={attempts}
            onChange={(e) => setAttempts(e.target.value)}
          />
        </Field>
      </div>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={useDistribution}
          onChange={(e) => setUseDistribution(e.target.checked)}
        />
        {w.exams}: {w.easy} / {w.medium} / {w.hard}
      </label>
      {useDistribution && (
        <div className="grid grid-cols-3 gap-3">
          {(["easy", "medium", "hard"] as const).map((k) => (
            <Field key={k} label={w[k]}>
              <Input
                type="number"
                min={0}
                max={100}
                value={distribution[k]}
                onChange={(e) =>
                  setDistribution({
                    ...distribution,
                    [k]: Number(e.target.value),
                  })
                }
              />
            </Field>
          ))}
        </div>
      )}
      <Button disabled={busy}>{w.save}</Button>
    </form>
  );
}
