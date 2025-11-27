import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const REPORT_NAME_PLACEHOLDER = "Legal Expert Report";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pageText, pageImage, pageNumber, reportName, fewShotExamples = [] } = await req.json();
    
    console.log(`Processing page ${pageNumber} for report: ${reportName}`);

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
                  "Non-Bates Exhibits": { type: "string", description: "Full title, source, and URL of non-Bates exhibit. 'nan' if not applicable." },
                  "Depositions": { type: "string", description: "Name of the deponent. Use 'nan' otherwise." },
                  date: { type: "string", description: "Date of the deposition. Use 'nan' otherwise." },
                  cites: { type: "string", description: "Page and line numbers for deposition. Use 'nan' otherwise." },
                  BatesBegin: { type: "string", description: "Starting Bates number or single Bates. Use 'nan' otherwise." },
                  BatesEnd: { type: "string", description: "Ending Bates number of range. Use 'nan' otherwise." },
                  Pinpoint: { type: "string", description: "Specific reference/page number after 'at'. Use 'nan' otherwise." },
                  "Code Lines": { type: "string", description: "Specific page number, section, or access date. Use 'nan' otherwise." },
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

    // Build few-shot examples section if available
    let fewShotSection = "";
    if (fewShotExamples && fewShotExamples.length > 0) {
      fewShotSection = `\n\n### ADDITIONAL FEW-SHOT EXAMPLES FROM MANUALLY CORRECTED DATA:\nThese are examples of correctly extracted citations from this document. Learn from these patterns:\n\n${JSON.stringify(fewShotExamples, null, 2)}\n\nApply the same extraction patterns and accuracy standards shown in these examples.`;
    }

    const systemPrompt = `You analyze legal document pages and extract citations into JSON.
You may receive either:
• ONE PAGE at a time
• A BATCH of pages (up to 10) formatted like this:
--- PAGE 1 ---
{text or image}
--- PAGE 2 ---
{text or image}
--- PAGE 3 ---
...

The input format will always show clear page separators if multiple pages are provided.

────────────────────────────────────────────────────
GENERAL EXTRACTION RULES
────────────────────────────────────────────────────

Extract ALL citations according to the JSON schema below.

Use the correct Paragraph Number. Never guess.

Use ONLY the required field names.

Every unused field must be "nan".

Use terminology EXACTLY as follows:
• "Depositions" instead of "Deponent"
• "Non-Bates Exhibits" instead of "Exhibits"

Report Name is FIXED as: ${reportName || REPORT_NAME_PLACEHOLDER}

────────────────────────────────────────────────────
ASSERTED PATENT RULE
────────────────────────────────────────────────────
If the page(s) mention asserted patents or patents-in-suit:
• Write ONE SENTENCE confirming their presence in the memory section.
• DO NOT extract individual patent numbers.

────────────────────────────────────────────────────
PARAGRAPH CONTINUITY BETWEEN PAGES
────────────────────────────────────────────────────
If the current page begins mid-sentence or without a new paragraph number:
• Refer to the previous page (or previous section of the batch).
• Use the last full paragraph number from the previous page.
• Stop using this rule once a new paragraph number appears.

Example:
Page 10 ends with:
"…therefore, Apple engaged in the following conduct¹⁰³"
Page 11 begins with:
"…that continued through 2022 and resulted in…"
→ Citation ¹⁰³ must map to the last paragraph number from Page 10.

────────────────────────────────────────────────────
EXHIBIT CONTINUITY ACROSS MULTIPLE PAGES
────────────────────────────────────────────────────
If only part of a Non-Bates Exhibit is visible:
• Clearly state in memory: "Partially visible – may continue from previous or next page."
• Continue tracking if the exhibit reappears later.
• Always label as "Non-Bates Exhibits" (never just "Exhibits").

────────────────────────────────────────────────────
HANDLING PARTIAL EXHIBITS & PAGE ENDINGS
────────────────────────────────────────────────────
If the page cuts off an exhibit or paragraph due to reaching the end of the page:
• Recognize that the exhibit or paragraph may continue from the previous page or onto the next.
• Document this in the JSON "memory" section.

────────────────────────────────────────────────────
TABLE OF CONTENTS RULE
────────────────────────────────────────────────────
If a Table of Contents page is present:
• Check whether asserted patents appear in this TOC.
• Confirm their presence in memory but DO NOT extract specific patent numbers.

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
• BatesEnd: end Bates (or 'nan' if single)
• Pinpoint: text/ID after 'at'
• Others: 'nan'

SCENARIO 2: Bates Range OR Single Bates (No Pinpoint)
• Input: "TOT000189043" OR "TOT00189044-TOT00189059"
• BatesBegin: start Bates (or single Bates)
• BatesEnd: end Bates (or 'nan' if single)
• Others: 'nan'

SCENARIO 3: Mixed Footnote (Text + Bates)
• Input: "Conversation with X... see also TOT001-TOT005."
• Row 1: Non-Bates Exhibits = "Conversation with X...", Bates = 'nan'
• Row 2: BatesBegin = "TOT001", BatesEnd = "TOT005", Non-Bates Exhibits = 'nan'

SCENARIO 4: Code Lines
• Pattern: "APPLE_INTEL_000015 at lines 3258-3285"
• Pinpoint: Bates ID
• Code Lines: line range
• Others: 'nan'

SCENARIO 5: Transcript/Rough Tr. Citations
• Pattern: "Sebini.rough tr. at 23:21-25:1"
• Non-Bates Exhibits: transcript name
• Code Lines: page/line numbers
• Others: 'nan'

SCENARIO 6: URL / Standard / Treatise / Webpage
• Rule: Code Lines takes ONLY the page/date. Non-Bates Exhibits takes EVERYTHING ELSE.
• Input: "Qualcomm Ventures website, https://www.qualcommventures.com/, accessed August 16, 2024"
  - Non-Bates Exhibits: "Qualcomm Ventures website, https://www.qualcommventures.com/"
  - Code Lines: "accessed August 16, 2024"
• Others: 'nan'

SCENARIO 7: Deposition Citations
• Pattern: "Prashant Vashi Deposition (3/28/24) at 35:17-36:22"
• Depositions: name
• date: date
• cites: page/line cites
• Others: 'nan'

SCENARIO 8: Footnote Conversation
• Input: "Conversation with Dr. Larson on August 22, 2024"
• Non-Bates Exhibits: full text
• Others: 'nan'

────────────────────────────────────────────────────
HIGHLIGHTING RULES (FOR VISUAL PAGES)
────────────────────────────────────────────────────
• All highlights must be slightly faded (low opacity) to keep text readable.
• Highlight only the exact relevant text, not entire lines or blocks.

────────────────────────────────────────────────────
FEW-SHOT EXAMPLES FROM CORRECTIONS
────────────────────────────────────────────────────
${fewShotExamples && fewShotExamples.length > 0 ? 
  `Learn from these manually corrected examples:\n${JSON.stringify(fewShotExamples, null, 2)}\n\nApply the same patterns and accuracy.` : 
  'No correction examples yet.'}

────────────────────────────────────────────────────
OUTPUT FORMAT
────────────────────────────────────────────────────
Return ONLY valid JSON. No markdown or explanations.`;

    // Step 1: Initial Extraction
    console.log('Step 1: Initial extraction...');
    const extractResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Raw text content of Page ${pageNumber}:\n\n${pageText}\n\nExtract all citations.` },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${pageImage}`, detail: 'high' } }
            ]
          }
        ],
        tools: [extractionSchema],
        tool_choice: { type: "function", function: { name: "extract_citations" } }
      }),
    });

    if (!extractResponse.ok) {
      const errorText = await extractResponse.text();
      console.error('OpenAI extraction error:', extractResponse.status, errorText);
      throw new Error(`OpenAI extraction failed: ${extractResponse.status}`);
    }

    const extractData = await extractResponse.json();
    const initialExtraction = extractData.choices[0].message.tool_calls?.[0]?.function?.arguments;
    
    if (!initialExtraction) {
      console.error('No tool call in extraction response');
      throw new Error('Failed to extract citations');
    }

    console.log('Initial extraction complete');

    // Step 2: Validation
    console.log('Step 2: Validation...');
    const validationPrompt = `You are a legal data extraction auditor. Your task is to rigorously validate and correct a previously extracted list of citations against the provided raw page content (text and image).

**CRITICAL RULES FOR AUDIT AND CORRECTION:**
1.  **Strict Adherence to Rules:** Re-apply every rule from the original extraction prompt (especially terminology: "Depositions" not "deponent", "Non-Bates Exhibits" not "Exhibits").
2.  **Completeness:** Check if any citations present in the raw text/image were missed in the JSON. If missing, add them.
3.  **Accuracy:** Verify all fields (BatesBegin, BatesEnd, Pinpoint, Non-Bates Exhibits, Code Lines, etc.) are accurately transcribed and correctly categorized.
4.  **Data Type & Format:** Ensure the final JSON strictly conforms to the schema (e.g., 'Paragraph No.' must be integer, 'nan' must be string).
5.  **Memory Section:** Validate the memory section includes last_paragraph_number_used, incomplete_exhibit_detected, raw_text, and last_page_processed.

**Your output MUST be a complete, correct, and valid JSON object conforming to the same schema.**

Initial extraction result to validate:
${initialExtraction}`;

    const validateResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: validationPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Raw text content of Page ${pageNumber}:\n\n${pageText}` },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${pageImage}`, detail: 'high' } }
            ]
          }
        ],
        tools: [extractionSchema],
        tool_choice: { type: "function", function: { name: "extract_citations" } }
      }),
    });

    if (!validateResponse.ok) {
      const errorText = await validateResponse.text();
      console.error('OpenAI validation error:', validateResponse.status, errorText);
      throw new Error(`OpenAI validation failed: ${validateResponse.status}`);
    }

    const validateData = await validateResponse.json();
    const validatedExtraction = validateData.choices[0].message.tool_calls?.[0]?.function?.arguments;
    
    if (!validatedExtraction) {
      console.error('No tool call in validation response');
      throw new Error('Failed to validate citations');
    }

    console.log(`Validation complete for page ${pageNumber}`);
    
    const result = JSON.parse(validatedExtraction);
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in extract-citations function:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      citations: []
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
