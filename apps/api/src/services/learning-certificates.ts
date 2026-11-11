import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { Db } from "@zerolax/db";
import type { LearningCertificate } from "@zerolax/shared";
import { ApiError } from "../errors";

export const PUBLIC_CERTIFICATE_COLUMNS =
  "verification_id,student_name,grade,book_title,score,completed_at,seconds_spent,revoked_at";
export async function certificatePdf(
  db: Db,
  userId: string | undefined,
  verificationId: string,
  webUrl: string,
  admin = false,
) {
  return db.transaction(async (tx) => {
    const [c] = await tx.query<
      LearningCertificate & { user_id: string; pdf: Buffer | null }
    >(
      `select * from learning_certificates where verification_id=$1 for update`,
      [verificationId],
    );
    if (!c || (!admin && c.user_id !== userId))
      throw new ApiError(404, "CERTIFICATE_NOT_FOUND", "Certificate not found");
    if (c.revoked_at)
      throw new ApiError(410, "CERTIFICATE_REVOKED", "Certificate revoked");
    if (c.pdf) return Buffer.from(c.pdf);
    const qr = await QRCode.toBuffer(
      `${webUrl}/certificates/${c.verification_id}`,
      { width: 220 },
    );
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 48,
    });
    const chunks: Buffer[] = [];
    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });
    // Embedded font supports Uzbek/Russian names on Windows and common Linux deployments.
    const { existsSync } = await import("node:fs");
    const font =
      process.env.CERTIFICATE_FONT_PATH ??
      [
        "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
      ].find((p) => existsSync(p));
    if (!font)
      throw new ApiError(
        503,
        "CERTIFICATE_FONT_REQUIRED",
        "Configure CERTIFICATE_FONT_PATH with a Unicode TrueType font",
      );
    doc.font(font);
    doc.rect(24, 24, 794, 547).lineWidth(2).stroke("#2563eb");
    doc
      .fontSize(28)
      .fillColor("#1e40af")
      .text("ZEROLAX — CERTIFICATE", { align: "center" });
    doc
      .moveDown()
      .fontSize(23)
      .fillColor("#111827")
      .text(c.student_name, { align: "center" });
    doc.moveDown().fontSize(16).text(c.book_title, { align: "center" });
    doc.text(`Grade: ${c.grade}    Score: ${c.score}/100`, { align: "center" });
    doc
      .moveDown()
      .fontSize(12)
      .text(`Completed: ${new Date(c.completed_at).toISOString()}`, {
        align: "center",
      });
    doc.text(`Exam time: ${c.seconds_spent} seconds`, { align: "center" });
    doc
      .moveDown()
      .fontSize(10)
      .text(`ID: ${c.verification_id}`, { align: "center" });
    doc.image(qr, 355, 355, { width: 130 });
    doc.end();
    const pdf = await finished;
    await tx.query(
      "update learning_certificates set pdf=$2 where verification_id=$1",
      [verificationId, pdf],
    );
    return pdf;
  });
}
