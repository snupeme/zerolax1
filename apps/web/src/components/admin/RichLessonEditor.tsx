import { useEffect,useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Mathematics } from "@tiptap/extension-mathematics";
import { RichContent } from "../RichContent";
import "katex/dist/katex.min.css";
import type { LearningTopic } from "@zerolax/shared";
import {
  control,
  useControlWords,
  toast,
  useUnsaved,
  uploadImage,
} from "../../lib/admin-control";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
export function RichLessonEditor({
  topic,
  onSaved,
  onDirty,
}: {
  topic: LearningTopic;
  onSaved: () => unknown;
  onDirty?:(dirty:boolean)=>void;
}) {
  const w = useControlWords();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [formula, setFormula] = useState("");
  const [link, setLink] = useState("");
  useUnsaved(dirty);
  useEffect(()=>onDirty?.(dirty),[dirty,onDirty]);
  useEffect(()=>()=>onDirty?.(false),[onDirty]);
  const initial =
    topic.content_format === "html"
      ? (topic.content ?? "")
      : `<p>${(topic.content ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "<br>")}</p>`;
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Mathematics.configure({
        katexOptions: { throwOnError: false, trust: false },
      }),
    ],
    content: initial,
    onUpdate: () => setDirty(true),
    editorProps: {
      attributes: { class: "min-h-72 p-4 focus:outline-none lesson-content" },
    },
  });
  const [savedHtml,setSavedHtml]=useState(initial);
  async function save() {
    if (!editor) return;
    setBusy(true);
    try {
      const response=await control<{html:string}>(
        `/topics/${topic.id}/rich-content`,
        { html: editor.getHTML() },
        "PUT",
      );
      editor.commands.setContent(response.html);
      setSavedHtml(response.html);
      setDirty(false);
      toast(w.saved);
      await onSaved();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="font-semibold">{topic.title}</h2>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          {w.bold}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          {w.italic}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          H2
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          •
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPreview(!preview)}
        >
          {w.preview}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex gap-2">
          <Input
            aria-label={w.formula}
            placeholder="x^2 + y^2 = z^2"
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
          />
          <Button
            variant="outline"
            disabled={!formula}
            onClick={() => {
              editor
                ?.chain()
                .focus()
                .insertInlineMath({ latex: formula })
                .run();
              setFormula("");
            }}
          >
            {w.formula}
          </Button>
        </div>
        <div className="flex gap-2">
          <Input
            aria-label={w.link}
            placeholder="https://"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <Button
            variant="outline"
            disabled={!link.startsWith("https://")}
            onClick={() => {
              editor
                ?.chain()
                .focus()
                .setLink({
                  href: link,
                  target: "_blank",
                  rel: "noopener noreferrer",
                })
                .run();
              setLink("");
            }}
          >
            {w.link}
          </Button>
        </div>
      </div>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label={w.image}
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try {
            const url = await uploadImage(file);
            editor
              ?.chain()
              .focus()
              .setImage({ src: url, alt: topic.title })
              .run();
          } catch (error) {
            toast((error as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      />
      <div className="overflow-hidden rounded-lg border">
        {preview ? (
          <div className="p-4">
            <RichContent content={editor?.getHTML() ?? ""} format="html" />
          </div>
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>
      <div className="flex gap-2">
        <Button disabled={busy || !dirty} onClick={() => void save()}>
          {w.save}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            editor?.commands.setContent(savedHtml);
            setDirty(false);
          }}
        >
          {w.cancel}
        </Button>
      </div>
    </section>
  );
}
