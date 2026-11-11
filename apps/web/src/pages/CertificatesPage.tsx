import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Award } from "lucide-react";
import type { LearningCertificate } from "@zerolax/shared";
import { learningRequest, downloadCertificate } from "../lib/learning";
import { useStudyWords, useStudyBack } from "../lib/study";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
export function CertificatesPage() {
  const w = useStudyWords();
  const back = useStudyBack("/");
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const q = useQuery({
    queryKey: ["my-certificates", offset],
    queryFn: () =>
      learningRequest<LearningCertificate[]>(
        `/certificates?limit=20&offset=${offset}`,
      ),
  });
  return (
    <div className="space-y-4">
      <PageHeader title={w.certificates} backTo="/" onBack={back} />
      {(q.error || error) && (
        <p role="alert" className="text-destructive">
          {error || q.error?.message}
        </p>
      )}
      {q.isLoading ? (
        <p>…</p>
      ) : !q.data?.length ? (
        <div className="space-y-3 rounded-xl border border-dashed p-8 text-center">
          <Award className="mx-auto text-primary" size={40} />
          <p>{w.noCertificates}</p>
        </div>
      ) : (
        q.data.map((c) => (
          <Card key={c.verification_id}>
            <CardContent className="space-y-3 p-4">
              <h2 className="font-bold">{c.book_title}</h2>
              <p>
                {w.score}: {c.score}/100
              </p>
              <Link
                className="mr-4 text-primary underline"
                to={`/certificates/${c.verification_id}`}
              >
                {w.verify}
              </Link>
              <Button
                variant="outline"
                disabled={!!c.revoked_at}
                onClick={async () => {
                  try {
                    await downloadCertificate(c.verification_id);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                {w.download}
              </Button>
            </CardContent>
          </Card>
        ))
      )}
      <div className="flex justify-between gap-3">
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
          {w.more}
        </Button>
      </div>
    </div>
  );
}
