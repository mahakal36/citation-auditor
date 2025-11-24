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
    const { pageText, pageImage, pageNumber, reportName } = await req.json();
    
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

    const systemPrompt = `You are an expert legal document analyst. Extract ALL citations from the provided document page.

**CRITICAL EXTRACTION RULES:**

1. **Report Name:** Fixed as '${reportName || REPORT_NAME_PLACEHOLDER}'.
2. **Paragraph Numbering:** The Paragraph No. MUST refer to the paragraph number in the main body text where the footnote marker appears.
3. **Default Values:** Unused fields MUST be 'nan'.
4. **Splitting:** Create a separate row for every citation separated by semicolons (;).

**SCENARIO TYPES:**

1. **Bates Number(s) with Pinpoint ('at'):**
   - Input: "TOT00191801-16 at TOT00191805"
   - BatesBegin: Start Bates
   - BatesEnd: End Bates (or 'nan' if single)
   - Pinpoint: Text/ID after 'at'
   - Others: 'nan'

2. **Deposition Citations:**
   - Pattern: "Prashant Vashi Deposition (3/28/24) at 35:17-36:22"
   - deponent: Name
   - date: Date
   - cites: Page/line cites
   - Others: 'nan'

3. **Exhibits/URLs/Treatises:**
   - Code Lines: Only for specific locator (e.g., "p. 14", "accessed August 16, 2024")
   - Exhibits: Everything else (Title, Author, Source, URL combined)

Use the IMAGE for layout understanding and TEXT for character accuracy.`;

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
    const validationPrompt = `You are a legal data extraction auditor. Validate and correct the extracted citations.

**VALIDATION RULES:**
1. Re-apply every rule from extraction (splitting, 'nan' defaults, Report/Paragraph mapping)
2. Check for completeness - add any missing citations
3. Verify accuracy of all fields
4. Ensure data type conformance

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
