import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Official OpenAI SDK – latest as of Dec 2025 (from JSR for Deno)
import OpenAI from "jsr:@openai/openai@4.80.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");

// Initialize client once (like Python's AsyncOpenAI)
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { selectedText, pageNumber, reportName } = await req.json();

    // Your full original classification prompt stays 100% unchanged
    const classificationPrompt = `You are classifying a piece of selected text from a legal document.

Your task is to determine which category the selected text belongs to.

Return only ONE of the following exact labels (no JSON, no explanations):
• Non-Bates Exhibits  
• Depositions  
• Date  
• Cites  
• Bates Begin  
• Bates End  
• Pinpoint  
• Code Lines  
• Report Name  
• Para. No.  
• Uncategorized   ← use ONLY when none of the categories applies

────────────────────────────────────────
CLASSIFICATION RULES
────────────────────────────────────────

1. **Bates Begin / Bates End**
   - If the text is a Bates number or range (e.g., "TOT00191801-16", "APPLE_000123"):
     • If it's a single Bates number → "Bates Begin"
     • If it's a range → "Bates Begin" (start) and later separately "Bates End" (end)
   
2. **Code Lines**
   - Look for line references (e.g., "lines 3258-3285", "23:21-25:1")

3. **Depositions**
   - Names followed by Deposition formatting (e.g., "Prashant Vashi Deposition", or name + Dep. cite)

4. **Non-Bates Exhibits**
   - Any citation-like text that is not Bates and not a deposition.
   - Conversations, transcripts, URLs, references, or general source text.

5. **Date**
   - If it resembles a clear date format (e.g., "3/28/24", "August 16, 2024")

6. **Cites**
   - Pinpoint page/line citations (e.g., "35:17-36:22")
   - NOT Bates and NOT code lines

7. **Pinpoint**
   - When "at" or pinpoint reference follows a Bates citation  
     Example: "TOT00018 at 3:22–4:5" → Pinpoint = "3:22–4:5"

8. **Report Name**
   - Always fixed and should only be classified when the selected text matches the known report name.

9. **Para. No.**
   - If the selected text is ONLY a paragraph number.

10. **Uncategorized**
    - Use this only if there is no confident match.

────────────────────────────────────────
OUTPUT FORMAT
────────────────────────────────────────
Return ONLY one of the category labels above. Do NOT return explanations or JSON.

Selected text:
"${selectedText}"

Return format: Just the category name (e.g., "Bates Begin" or "Uncategorized")`;

    // === REPLACED FETCH WITH client.responses.create() ===
    console.log("Classifying text with gpt-5-mini via SDK...");

    const response = await client.responses.create({
      model: "gpt-5-mini",  // Real model as of Dec 2025
      input: [
        { role: "system", content: "You are a precise legal citation classifier. Return ONLY the category name, nothing else." },
        { role: "user", content: classificationPrompt }
      ],
      temperature: 0,
      maxTokens: 50,
    });

    // Extract output text (mirrors your original parsing)
    let aiResponse = "";
    for (const item of response.output ?? []) {
      if (item.type === "message" && item.content) {
        for (const contentPiece of item.content) {
          if (contentPiece.type === "text" && contentPiece.text) {
            aiResponse += contentPiece.text;
          }
        }
      }
    }

    if (!aiResponse) {
      throw new Error("No output from gpt-5-mini");
    }

    aiResponse = aiResponse.trim();
    let category = aiResponse.replace(/[•\-\s]+$/, '').trim();

    // Detect Bates ranges and split them (your original logic – unchanged)
    let batesBegin = null;
    let batesEnd = null;
    
    if (category === "Bates Begin" || category === "Bates End") {
      const batesRangeMatch = selectedText.match(/^([A-Z0-9_]+)-([A-Z0-9_]+)$/i);
      if (batesRangeMatch) {
        batesBegin = batesRangeMatch[1];
        batesEnd = batesRangeMatch[2];
        category = "Bates Range";
      }
    }

    return new Response(
      JSON.stringify({
        category,
        value: selectedText,
        batesBegin,
        batesEnd,
        pageNumber,
        reportName,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Classification error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});