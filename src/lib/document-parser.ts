import fs from "fs";

export async function extractText(filePath: string, fileType: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);

  switch (fileType.toLowerCase()) {
    case "pdf": {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { PDFParse } = require("pdf-parse");
        const parser = new PDFParse({});
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
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mammoth = require("mammoth");
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
  const buffer = fs.readFileSync(filePath);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require("mammoth");
  const result = await mammoth.convertToHtml({ buffer });
  return result.value;
}
