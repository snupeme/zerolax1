import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { control, useControlWords, toast } from "../../lib/admin-control";
import { learningRequest } from "../../lib/learning";
import { DataTable, Field, ImageUpload, selectClass } from "./ControlUi";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
interface Question {
  id: string;
  text: string;
  difficulty: string;
  tags: string[];
  image_url: string | null;
}
export function QuestionMetadataEditor({ topicId }: { topicId: string }) {
  const w = useControlWords();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Question | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["control-question-meta", topicId, offset],
    queryFn: () =>
      learningRequest<Question[]>(
        `/topics/${topicId}/questions?limit=20&offset=${offset}`,
        undefined,
        "GET",
        true,
      ),
  });
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="font-semibold">{w.exams}</h2>
      {q.error && <p className="text-destructive">{q.error.message}</p>}
      <DataTable
        rows={(q.data ?? []).map((q) => ({
          id: q.id,
          text: q.text,
          difficulty: q.difficulty,
          tags: q.tags,
        }))}
        onSelect={(r) =>
          setSelected(q.data?.find((q) => q.id === r.id) ?? null)
        }
      />
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={!offset}
          onClick={() => setOffset(Math.max(0, offset - 20))}
        >
          {w.back}
        </Button>
        <Button
          variant="outline"
          disabled={q.data?.length !== 20}
          onClick={() => setOffset(offset + 20)}
        >
          {w.next}
        </Button>
      </div>
      {selected && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await control(
                `/questions/${selected.id}/metadata`,
                {
                  difficulty: selected.difficulty,
                  tags: selected.tags.filter(Boolean),
                  imageUrl: selected.image_url,
                },
                "PUT",
              );
              toast(w.saved);
              await q.refetch();
            } catch (error) {
              toast((error as Error).message, true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="font-medium">{selected.text}</p>
          <Field label={w.exams}>
            <select
              className={selectClass}
              value={selected.difficulty}
              onChange={(e) =>
                setSelected({ ...selected, difficulty: e.target.value })
              }
            >
              {(["easy", "medium", "hard"] as const).map((k) => (
                <option value={k} key={k}>
                  {w[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="#">
            <Input
              value={selected.tags.join(", ")}
              onChange={(e) =>
                setSelected({
                  ...selected,
                  tags: e.target.value.split(",").map((t) => t.trim()),
                })
              }
            />
          </Field>
          <ImageUpload
            value={selected.image_url ?? ""}
            onChange={(image_url) => setSelected({ ...selected, image_url })}
          />
          <Button disabled={busy}>{w.save}</Button>
        </form>
      )}
    </section>
  );
}
