import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getDocument } from "https://deno.land/x/pdfjs@2.12.313/dist/pdf.js";

import OpenAI from "https://jsr.io/@openai/openai/0.5.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");

const client = new OpenAI({ apiKey: OPENAI_API_KEY });
const REPORT_NAME_PLACEHOLDER = "Legal Expert Report";

// FULL ORIGINAL EXTRACTION SCHEMA
const extractionSchema = {
  type: "function",
  function: {
    name: "extract_citations",
    description: "Extract all citations from a legal document page",
    parameters: {
      type: "object",
      properties: {
        citations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              "Non-Bates Exhibits": { type: "string", description: "Full title, source, and URL of non-Bates exhibit. Blank string if not applicable." },
              "Depositions": { type: "string", description: "Name of the deponent. Use blank string otherwise." },
              date: { type: "string", description: "Date of the deposition (capitalize first letter). Use blank string otherwise." },
              cites: { type: "string", description: "Page and line numbers for deposition (capitalize first letter). Use blank string otherwise." },
              BatesBegin: { type: "string", description: "Starting Bates number or single Bates. Use blank string otherwise." },
              BatesEnd: { type: "string", description: "Ending Bates number of range. Use blank string otherwise." },
              Pinpoint: { type: "string", description: "Specific reference/page number after 'at'. Use blank string otherwise." },
              "Code Lines": { type: "string", description: "Specific page number, section, or access date. Use blank string otherwise." },
              "Report Name": { type: "string", description: "The file name." },
              "Paragraph No.": { type: "integer", description: "Paragraph number from main body text." }
            },
            required: ["Non-Bates Exhibits", "Depositions", "date", "cites", "BatesBegin", "BatesEnd", "Pinpoint", "Code Lines", "Report Name", "Paragraph No."]
          }
        },
        memory: {
          type: "object",
          properties: {
            last_paragraph_number_used: { type: ["integer", "null"], description: "Last paragraph number used in extraction" },
            incomplete_exhibit_detected: { type: "boolean", description: "Whether an incomplete exhibit was detected" },
            raw_text: { type: "string", description: "Raw text of current or last page processed" },
            last_page_processed: { type: "integer", description: "Last page number processed" }
          },
          required: ["last_paragraph_number_used", "incomplete_exhibit_detected", "raw_text", "last_page_processed"]
        }
      },
      required: ["citations", "memory"]
    }
  }
};

// FULL ORIGINAL SYSTEM PROMPT — 100% VERBATIM
const getSystemPrompt = (reportName: string, fewShotExamples: any[] = []) => `You analyze legal document pages and extract citations into JSON.
Input may contain:
• ONE PAGE at a time
• OR a BATCH of pages (up to 10) formatted as:
--- PAGE 1 ---
{text}
--- PAGE 2 ---
...

Always treat pages as separate unless continuity rules apply.

────────────────────────────────────────────────────
GENERAL EXTRACTION RULES
────────────────────────────────────────────────────

Extract ALL citations according to the JSON schema below.

Use the correct Paragraph Number. Never guess.

Use ONLY the required field names.

If a field is empty, use "" (blank), not "nan".

Use terminology EXACTLY as follows:
• "Depositions" instead of "Deponent"
• "Non-Bates Exhibits" instead of "Exhibits"

If a row contains ALL blank fields → do NOT include that row in the JSON.

Date and Cites columns: first letter must be capitalized.

Report Name is FIXED as: ${reportName || REPORT_NAME_PLACEHOLDER}

────────────────────────────────────────────────────
ASSERTED PATENT RULE
────────────────────────────────────────────────────
If the page(s) mention asserted patents or patents-in-suit:
• Write ONE SENTENCE confirming their presence.
• DO NOT extract individual patent numbers.
• DO NOT extract pinpoint cites related to asserted patents.
• If additional information appears with the patent number (e.g., "U.S. Patent No. 7,532,865 at 1:45–50") → do not extract that citation at all.

────────────────────────────────────────────────────
TABLE OF CONTENTS RULE
────────────────────────────────────────────────────
When a TOC page is encountered:
• Confirm whether asserted patents or patents-in-suit are present.
• No extraction should occur for TOC pages.

────────────────────────────────────────────────────
PARAGRAPH CONTINUITY BETWEEN PAGES
────────────────────────────────────────────────────
If the current page begins mid-sentence or without a new paragraph number:
• Refer to the last full paragraph number from the previous page.
• Use that number until a new paragraph number appears.

Example:
Page 10 ends with: "…therefore, Apple engaged in the following conduct¹⁰³"
Page 11 begins with: "…that continued through 2022 and resulted in…"
→ Citation ¹⁰³ maps to the last paragraph number from Page 10.

────────────────────────────────────────────────────
"Id." HANDLING RULE
────────────────────────────────────────────────────
When "Id." or "id" appears (like "20 Id" or "Id."):
• Locate the paragraph associated with reference number 20.
• Use the immediately preceding reference as the exhibit.
• If that preceding reference is also "Id.", go further back to the last non-Id reference.

────────────────────────────────────────────────────
EXHIBIT CONTINUITY BETWEEN PAGES
────────────────────────────────────────────────────
If only part of a Non-Bates Exhibit is visible:
• Mark as: "Partially visible – may continue from previous or next page."
• Continue tracking if it reappears later.
• Always label as "Non-Bates Exhibits".

────────────────────────────────────────────────────
SPLITTING RULES
────────────────────────────────────────────────────
• Citations separated by semicolons (;) MUST be split into separate rows.
• Each Bates number or exhibit must have its own row.
• Mixed footnotes (text + Bates) must be separated into multiple rows.

────────────────────────────────────────────────────
CITATION TYPE SCENARIOS
────────────────────────────────────────────────────

SCENARIO 1: Bates Number(s) with Pinpoint ('at')
• Input: "TOT00191801-16 at TOT00191805"
• BatesBegin: start Bates
• BatesEnd: end Bates (or '' if single)
• Pinpoint: text/ID after 'at'
• Others: ''

SCENARIO 2: Bates Range OR Single Bates (No Pinpoint)
• Input: "TOT000189043" OR "TOT00189044-TOT00189059"
• BatesBegin: start Bates (or single Bates)
• BatesEnd: end Bates (or '' if single)
• Others: ''

SCENARIO 3: Mixed Footnote (Text + Bates)
• Input: "Conversation with X... see also TOT001-TOT005."
• Row 1: Non-Bates Exhibits = "Conversation with X...", Bates = ''
• Row 2: BatesBegin = "TOT001", BatesEnd = "TOT005", Non-Bates Exhibits = ''

SCENARIO 4: Code Lines
• Pattern: "APPLE_INTEL_000015 at lines 3258-3285"
• Pinpoint: Bates ID
• Code Lines: line range
• Others: ''

SCENARIO 5: Transcript/Rough Tr. Citations
• Pattern: "Sebini.rough tr. at 23:21-25:1"
• Non-Bates Exhibits: transcript name
• Code Lines: page/line numbers
• Others: ''

SCENARIO 6: URL / Standard / Treatise / Webpage
• Rule: Code Lines takes ONLY the page/date. Non-Bates Exhibits takes EVERYTHING ELSE.
• Input: "Qualcomm Ventures website, https://www.qualcommventures.com/, accessed August 16, 2024"
  - Non-Bates Exhibits: "Qualcomm Ventures website, https://www.qualcommventures.com/"
  - Code Lines: "accessed August 16, 2024"
• Others: ''

SCENARIO 7: Deposition Citations
• Pattern: "Prashant Vashi Deposition (3/28/24) at 35:17-36:22"
• Depositions: name
• date: date
• cites: page/line cites
• Others: ''

SCENARIO 8: Footnote Conversation
• Input: "Conversation with Dr. Larson on August 22, 2024"
• Non-Bates Exhibits: full text
• Others: ''

────────────────────────────────────────────────────
FEW-SHOT EXAMPLES FROM CORRECTIONS
────────────────────────────────────────────────────
${fewShotExamples && fewShotExamples.length > 0
  ? `Learn from these manually corrected examples:\n${JSON.stringify(fewShotExamples, null, 2)}\n\nApply the same patterns and accuracy.`
  : 'No correction examples yet.'}

────────────────────────────────────────────────────
REQUIRED JSON OUTPUT FORMAT
────────────────────────────────────────────────────
Return ONLY valid JSON:

{
  "citations": [
    {
      "Non-Bates Exhibits": "",
      "Depositions": "",
      "date": "",
      "cites": "",
      "BatesBegin": "",
      "BatesEnd": "",
      "Pinpoint": "",
      "Code Lines": "",
      "Report Name": "${reportName || REPORT_NAME_PLACEHOLDER}",
      "Paragraph No.": 123
    }
  ],
  "memory": {
    "last_paragraph_number_used": 145,
    "incomplete_exhibit_detected": false,
    "raw_text": "...",
    "last_page_processed": ${null}
  }
}

Only return JSON. No explanations or markdown.`;

// PDF TEXT EXTRACTION
async function extractTextFromPDF(pdfData: Uint8Array): Promise<string> {
  try {
    const loadingTask = getDocument({ data: pdfData });
    const pdf = await loadingTask.promise;
    let fullText = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(" ");
      fullText += `\n--- PAGE ${pageNum} ---\n${pageText}\n`;
    }
    return fullText;
  } catch (error) {
    console.error("PDF extraction error:", error);
    throw new Error("Failed to extract text from PDF");
  }
}

// MAIN SERVER
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfData, pageNumber, reportName, fewShotExamples = [], skipValidation = true } = await req.json();

    let pageText = "";
    if (pdfData) {
      const pdfBytes = typeof pdfData === "string"
        ? Uint8Array.from(atob(pdfData.replace(/^data:application\/pdf;base64,/, "")), c => c.charCodeAt(0))
        : new Uint8Array(pdfData);

      const fullText = await extractTextFromPDF(pdfBytes);

      const pageStartMarker = `--- PAGE ${pageNumber} ---`;
      const nextPageMarker = `--- PAGE ${pageNumber + 1} ---`;
      const startIndex = fullText.indexOf(pageStartMarker);
      if (startIndex === -1) throw new Error(`Page ${pageNumber} marker not found`);

      const contentStart = startIndex + pageStartMarker.length;
      const contentEnd = fullText.includes(nextPageMarker) ? fullText.indexOf(nextPageMarker) : fullText.length;
      pageText = fullText.slice(contentStart, contentEnd).trim();
    }

    if (!pageText) throw new Error("No text extracted from PDF");

    // REAL client.responses.create() CALL
    const response = await client.responses.create({
      model: "gpt-5-mini",
      input: [
        { role: "system", content: getSystemPrompt(reportName, fewShotExamples) },
        { role: "user", content: `Page ${pageNumber} text:\n\n${pageText}` }
      ],
      tools: [extractionSchema],
      tool_choice: { type: "function", function: { name: "extract_citations" } },
      temperature: 0,
     :max_tokens: 4000,
    });

    // Extract tool call result
    let jsonString = "";
    for (const item of response.output ?? []) {
      if (item.type === "tool_call" && item.function?.name === "extract_citations") {
        jsonString = item.function.arguments;
        break;
      }
    }

    if (!jsonString) throw new Error("No extract_citations tool call returned");

    const result = JSON.parse(jsonString);

    // Optional cleanup
    if (!skipValidation && result.citations?.length > 0) {
      result.citations = result.citations
        .filter((c: any) => Object.values(c).some((v: any) => v !== "" && v != null))
        .map((c: any) => {
          c["Paragraph No."] = parseInt(c["Paragraph No."], 10) || null;
          return c;
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Server error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
      citations: [],
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});