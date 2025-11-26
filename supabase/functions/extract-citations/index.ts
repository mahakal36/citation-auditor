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
                  Exhibits: { type: "string", description: "Full title, source, and URL of non-Bates exhibit. 'nan' if not applicable." },
                  deponent: { type: "string", description: "Name of the deponent. Use 'nan' otherwise." },
                  date: { type: "string", description: "Date of the deposition. Use 'nan' otherwise." },
                  cites: { type: "string", description: "Page and line numbers for deposition. Use 'nan' otherwise." },
                  BatesBegin: { type: "string", description: "Starting Bates number or single Bates. Use 'nan' otherwise." },
                  BatesEnd: { type: "string", description: "Ending Bates number of range. Use 'nan' otherwise." },
                  Pinpoint: { type: "string", description: "Specific reference/page number after 'at'. Use 'nan' otherwise." },
                  "Code Lines": { type: "string", description: "Specific page number, section, or access date. Use 'nan' otherwise." },
                  "Report Name": { type: "string", description: "The file name." },
                  "Paragraph No.": { type: "integer", description: "Paragraph number from main body text." }
                },
                required: ["Exhibits", "deponent", "date", "cites", "BatesBegin", "BatesEnd", "Pinpoint", "Code Lines", "Report Name", "Paragraph No."]
              }
            }
          },
          required: ["citations"]
        }
      }
    };

    // Build few-shot examples section if available
    let fewShotSection = "";
    if (fewShotExamples && fewShotExamples.length > 0) {
      fewShotSection = `\n\n### ADDITIONAL FEW-SHOT EXAMPLES FROM MANUALLY CORRECTED DATA:\nThese are examples of correctly extracted citations from this document. Learn from these patterns:\n\n${JSON.stringify(fewShotExamples, null, 2)}\n\nApply the same extraction patterns and accuracy standards shown in these examples.`;
    }

    const systemPrompt = `You are an expert legal document analyst. Your task is to extract **ALL** citations from the provided document page.

**INPUT DATA:** You have been provided with an **IMAGE** of the page AND the raw **TEXT** content extracted from that page.
1. Use the **IMAGE** to understand the layout (footnotes vs body).
2. Use the **TEXT** to ensure 100% character accuracy.

### CHAIN-OF-THOUGHT (CoT) - EXECUTE THIS FOR EVERY LINE:
1. **Detect Splitters:** Does the line contain semicolons (;)? If yes, split the line into distinct parts immediately.
2. **Analyze Mixed Footnotes:** Does a footnote contain BOTH text (e.g., "Conversation with...") AND Bates numbers?
    - **CRITICAL:** You must separate them. Create ONE row for the Text (Exhibit) and SEPARATE rows for the Bates numbers.
3. **Separate Metadata (Crucial):** - **For Exhibits/URLs/Treatises:** The \`Code Lines\` field is **ONLY** for the specific locator (e.g., "p. 14", "accessed August 16, 2024", "at 59").
    - **EVERYTHING ELSE** (Title, Author, Source, URL) must be combined into the \`Exhibits\` field. Do not split the URL itself into Code Lines.

### CRITICAL EXTRACTION RULES:

1.  **Report Name:** Fixed as '${reportName || REPORT_NAME_PLACEHOLDER}'.
2.  **Paragraph Numbering (CRITICAL):** The **Paragraph No.** column MUST refer to the **Paragraph Number in the main body text** (e.g., 73, 74, 75) where the footnote marker appears, **NOT** the footnote number (e.g., 86, 87).
3.  **Default Values:** Unused fields MUST be 'nan'.
4.  **Splitting:** You MUST create a separate row for *every* citation separated by a semicolon (;). **Do not ignore single Bates numbers found in a list.**

---
#### SCENARIO 1: Bates Number(s) with Pinpoint ('at')
-   **Type:** BATES_PINPOINT.
-   **Input:** "TOT00191801-16 at TOT00191805" OR "VZTOT0000022 at VZTOT0000040"
-   **BatesBegin:** The start Bates.
-   **BatesEnd:** The end Bates (or 'nan' if single).
-   **Pinpoint:** The text/ID after 'at'.
-   **Others:** 'nan'.

#### SCENARIO 2: Bates Range OR Single Bates (No Pinpoint)
-   **Type:** BATES_RANGE.
-   **Input:** "TOT000189043" OR "TOT00189044-TOT00189059"
-   **BatesBegin:** The start Bates (or the single Bates).
-   **BatesEnd:** The end Bates (or 'nan' if single).
-   **Others:** 'nan'.

#### SCENARIO 3: Footnote Mixed Content (Text + Bates)
-   **Type:** MIXED_FOOTNOTE.
-   **Input:** "Conversation with X... see also TOT001-TOT005."
-   **Action:** 1. Create Row 1: **Exhibits** = "Conversation with X...", Bates = 'nan'.
    2. Create Row 2: **BatesBegin** = "TOT001", **BatesEnd** = "TOT005", Exhibits = 'nan'.

#### SCENARIO 4: Code Lines
-   **Type:** CODE_LINE.
-   **Pattern:** APPLE_INTEL_000015 at lines 3258-3285
-   **Pinpoint:** Bates ID.
-   **Code Lines:** Line range.
-   **Others:** 'nan'.

#### SCENARIO 5: Transcript/Rough Tr. Citations
-   **Type:** TRANSCRIPT.
-   **Pattern:** Sebini.rough tr. at 23:21-25:1.
-   **Exhibits:** Transcript name ("Sebini.rough tr.").
-   **Code Lines:** Page/line numbers ("23:21-25:1").
-   **Others:** 'nan'.

#### SCENARIO 6: URL / Standard / Treatise / Webpage (STRICT SEPARATION)
-   **Type:** NON_BATES_EXHIBIT.
-   **Rule:** **\`Code Lines\` takes ONLY the Page/Date.** \`Exhibits\` takes EVERYTHING ELSE.
-   **Input:** "Qualcomm Ventures website, https://www.qualcommventures.com/, accessed August 16, 2024."
    -   **Exhibits:** "Qualcomm Ventures website, https://www.qualcommventures.com/"
    -   **Code Lines:** "accessed August 16, 2024"
-   **Input:** "Qualcomm Inc., Form 10-K for 2023, p. 14."
    -   **Exhibits:** "Qualcomm Inc., Form 10-K for 2023"
    -   **Code Lines:** "p. 14"
-   **Others:** 'nan'.

#### SCENARIO 7: Deposition Citations
-   **Type:** DEPOSITION.
-   **Pattern:** Prashant Vashi Deposition (3/28/24) at 35:17-36:22
-   **deponent:** Name.
-   **date:** Date.
-   **cites:** Page/line cites.
-   **Others:** 'nan'.

#### SCENARIO 8: Footnote Conversation
-   **Type:** FOOTNOTE EXHIBIT.
-   **Input:** "Conversation with Dr. Larson on August 22, 2024"
-   **Exhibits:** "Conversation with Dr. Larson on August 22, 2024"
-   **Others:** 'nan'.

---
### FEW-SHOT EXAMPLE (Demonstrating Correct Paragraph Mapping, Separation, Splitting & Mixed Content):

**Input Text (Simulated Main Text Mapping):**
73. ... text ending with footnote marker ⁸⁸.
74. ... text ending with footnote marker ⁹¹.
88 Conversation with Alvaro Medrano, August 22, 2024. See also TOT00116811-TOT00116815.
91 Conversation with Alvaro Medrano, August 22, 2024; Conversation with Miguel Blanco, August 23, 2024.

**Output JSON:**
[
  {
    "Exhibits": "Conversation with Alvaro Medrano, August 22, 2024",
    "deponent": "nan", "date": "nan", "cites": "nan",
    "BatesBegin": "nan", "BatesEnd": "nan", "Pinpoint": "nan",
    "Code Lines": "nan",
    "Report Name": "${reportName || REPORT_NAME_PLACEHOLDER}", "Paragraph No.": 73
  },
  {
    "Exhibits": "nan", "deponent": "nan", "date": "nan", "cites": "nan",
    "BatesBegin": "TOT00116811", "BatesEnd": "TOT00116815", "Pinpoint": "nan",
    "Code Lines": "nan",
    "Report Name": "${reportName || REPORT_NAME_PLACEHOLDER}", "Paragraph No.": 73
  },
  {
    "Exhibits": "Conversation with Alvaro Medrano, August 22, 2024",
    "deponent": "nan", "date": "nan", "cites": "nan",
    "BatesBegin": "nan", "BatesEnd": "nan", "Pinpoint": "nan",
    "Code Lines": "nan",
    "Report Name": "${reportName || REPORT_NAME_PLACEHOLDER}", "Paragraph No.": 74
  },
  {
    "Exhibits": "Conversation with Miguel Blanco, August 23, 2024",
    "deponent": "nan", "date": "nan", "cites": "nan",
    "BatesBegin": "nan", "BatesEnd": "nan", "Pinpoint": "nan",
    "Code Lines": "nan",
    "Report Name": "${reportName || REPORT_NAME_PLACEHOLDER}", "Paragraph No.": 74
  }
]${fewShotSection}`;

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
1.  **Strict Adherence to Rules:** Re-apply every rule from the original extraction prompt (especially for splitting, 'nan' defaults, and Report/Paragraph mapping).
2.  **Completeness:** Check if any citations present in the raw text/image were missed in the JSON. If missing, add them.
3.  **Accuracy:** Check if all fields (BatesBegin, BatesEnd, Pinpoint, Exhibits, Code Lines, etc.) are accurately transcribed from the source text and correctly categorized according to the provided schema.
4.  **Data Type & Format:** Ensure the final JSON strictly conforms to the provided schema (e.g., 'Paragraph No.' must be an integer, 'nan' must be a string).

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
