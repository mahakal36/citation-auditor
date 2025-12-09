import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.67.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { selectedText, pageNumber, reportName } = await req.json();

    // -----------------------------
    // RULE-BASED QUICK CLASSIFIERS
    // -----------------------------
    const text = (selectedText ?? "").toString().trim();
    const hasUrl = /(https?:\/\/|www\.)/i.test(text);

    // Expand Bates range like TOT00191801-16 into full end value using begin's prefix
    const expandBatesRange = (begin: string, endPart: string): { begin: string; end: string } => {
      // If endPart already looks like a full Bates token, use it
      if (/^[A-Z][A-Z0-9_]*\d{2,}$/i.test(endPart)) {
        return { begin, end: endPart };
      }
      // Otherwise, assume it's a numeric suffix and graft onto begin's non-numeric prefix
      const m = begin.match(/^(.*?)(\d+)$/);
      if (m) {
        const prefix = m[1];
        const endNum = endPart.replace(/\D+/g, "");
        return { begin, end: `${prefix}${endNum}` };
      }
      return { begin, end: endPart };
    };

    // 1) URL present → force Non-Bates Exhibits category (server-side guarantee)
    if (hasUrl) {
      return new Response(
        JSON.stringify({
          category: "Non-Bates Exhibits",
          value: selectedText,
          batesBegin: null,
          batesEnd: null,
          pageNumber,
          reportName,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2) Explicit markers Bates Begin= / Bates End=
    const beginMatch = text.match(/bates\s*begin\s*=\s*([A-Z][A-Z0-9_]*\d{2,})/i);
    const endMatch = text.match(/bates\s*end\s*=\s*([A-Z][A-Z0-9_]*\d{2,})/i);
    if (beginMatch && endMatch) {
      return new Response(
        JSON.stringify({
          category: "Bates Range",
          value: selectedText,
          batesBegin: beginMatch[1],
          batesEnd: endMatch[1],
          pageNumber,
          reportName,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (beginMatch) {
      return new Response(
        JSON.stringify({
          category: "Bates Begin",
          value: selectedText,
          batesBegin: beginMatch[1],
          batesEnd: null,
          pageNumber,
          reportName,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (endMatch) {
      return new Response(
        JSON.stringify({
          category: "Bates End",
          value: selectedText,
          batesBegin: null,
          batesEnd: endMatch[1],
          pageNumber,
          reportName,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3) Generic Bates range like TOT00191801-16 or TOT00191801–TOT00191816
    const rangeMatch = text.match(/\b([A-Z][A-Z0-9_]*\d{3,})\s*[–-]\s*([A-Z0-9_]*\d{1,})\b/);
    if (rangeMatch) {
      const { begin, end } = expandBatesRange(rangeMatch[1], rangeMatch[2]);
      return new Response(
        JSON.stringify({
          category: "Bates Range",
          value: selectedText,
          batesBegin: begin,
          batesEnd: end,
          pageNumber,
          reportName,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
ADDITIONAL CONTEXT FOR FIELD EXTRACTION (do not change output format)
────────────────────────────────────────
When you reason about the text, use these field rules as guidance to infer the best category. Do NOT return a JSON record here; still return only the single category label. These rules are for context only:

Fields to consider conceptually:
• Bates Begin
• Bates End
• Pinpoint
• URL
• Non-Bates Exhibits
• Notes (anything relevant that doesn’t fit the above)

Rules:
• A Bates range appears in the format "XXXX-YYYYYY" or similar.
• If the text contains "Bates Begin=" or "Bates End=", prefer those values even if other numbers also appear.
• Treat the first number after the word "at" as the Pinpoint.
• If the text contains a URL, that indicates URL context and may imply Non-Bates Exhibits text around it.
• If the text describes something as "Non-Bates Exhibits", capture that phrase as Non-Bates Exhibits.
• If the text includes timestamps (for example, "at 2:35"), treat that as the Pinpoint only when it follows a URL reference.
• If any field would be missing in a record, it would conceptually be null.

Example input for your reasoning (again: output must still be just one category label):
“TOT00191801-16 at TOT00191805 Bates Begin=TOT00191801, Bates End=TOT00191816, Pinpoint=TOT00191805 … https://www.qualcomm.com/research/5g/3g
 at 2:35 = Non-Bates Exhibits”

────────────────────────────────────────
OUTPUT FORMAT
────────────────────────────────────────
Return ONLY one of the category labels above. Do NOT return explanations or JSON.

Selected text:
"${selectedText}"

Return format: Just the category name (e.g., "Bates Begin" or "Uncategorized")`;

    // Use standard OpenAI chat completions API
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a precise legal citation classifier. Return ONLY the category name, nothing else." },
        { role: "user", content: classificationPrompt }
      ],
      temperature: 0,
      max_tokens: 50,
    });

    // Extract text response
    let aiResponse = response.choices?.[0]?.message?.content || "";

    aiResponse = aiResponse.trim();
    if (!aiResponse) throw new Error("Empty response from model");

    // The model should return just the category name
    let category = aiResponse.replace(/[•\-\s]+$/, "").trim();

    // Final safety: if our earlier quick rules didn't fire, still force URL to Non-Bates Exhibits or expand ranges
    if (/(https?:\/\/|www\.)/i.test(text)) {
      category = "Non-Bates Exhibits";
    }

    // Detect Bates ranges and split them
    let batesBegin: string | null = null;
    let batesEnd: string | null = null;
    const batesRangeMatch = text.match(/\b([A-Z][A-Z0-9_]*\d{3,})\s*[–-]\s*([A-Z0-9_]*\d{1,})\b/);
    if (batesRangeMatch) {
      const exp = expandBatesRange(batesRangeMatch[1], batesRangeMatch[2]);
      batesBegin = exp.begin;
      batesEnd = exp.end;
      category = "Bates Range";
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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Classification error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});