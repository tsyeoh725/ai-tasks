// SL-4: async file I/O. The previous fs.readFileSync blocked the event loop
// for the duration of the read; on a 50 MB PDF (no size cap historically)
// this stalled every other request to the server.
//
// Dynamic imports defer pulling in pdf-parse / mammoth until the moment we
// need them, so cold-start latency for non-document routes stays unaffected.

import { promises as fs } from "fs";

export async function extractText(filePath: string, fileType: string): Promise<string> {
  const buffer = await fs.readFile(filePath);

  switch (fileType.toLowerCase()) {
    case "pdf": {
      try {
        const mod = (await import("pdf-parse")) as unknown as {
          PDFParse: new (opts: Record<string, unknown>) => {
            load(buf: Buffer): Promise<void>;
            getText(): Promise<string>;
            destroy(): void;
          };
        };
        const parser = new mod.PDFParse({});
        await parser.load(buffer);
        const text = await parser.getText();
        parser.destroy();
        return text;
      } catch {
        return "[PDF text extraction failed]";
      }
    }
    case "doc":
    case "docx": {
      try {
        const mammoth = (await import("mammoth")) as unknown as {
          extractRawText(opts: { buffer: Buffer }): Promise<{ value: string }>;
        };
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      } catch {
        return "[DOCX text extraction failed]";
      }
    }
    case "ppt":
    case "pptx": {
      return "[PPTX text extraction: upload as PDF for best results]";
    }
    default:
      return "";
  }
}

export async function renderDocxToHtml(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const mammoth = (await import("mammoth")) as unknown as {
    convertToHtml(opts: { buffer: Buffer }): Promise<{ value: string }>;
  };
  const result = await mammoth.convertToHtml({ buffer });
  return result.value;
}
