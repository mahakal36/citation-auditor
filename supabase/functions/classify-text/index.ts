import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { selectedText, pageNumber, reportName } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const classificationPrompt = `You are a legal citation classifier. Analyze the following text and determine if it belongs to one of these categories:

Categories:
- Non-Bates Exhibits: Exhibit references without Bates numbers (e.g., "Ex. 5", "Exhibit A")
- Depositions: Deposition references (e.g., "Smith Dep.", "Jones Deposition")
- date: Dates in legal format (e.g., "Jan. 15, 2023", "January 2023")
- cites: Case citations (e.g., "Smith v. Jones, 123 F.3d 456")
- BatesBegin: Starting Bates number (e.g., "ABC00001")
- BatesEnd: Ending Bates number (e.g., "ABC00010")
- Pinpoint: Page or line references (e.g., "at 5", "p. 10", "¶ 23")
- Code Lines: Code section references (e.g., "§ 101", "35 U.S.C. § 112")
- Report Name: Name of a report or document
- Para. No.: Paragraph number (integer only)

Text to classify: "${selectedText}"

Return ONLY a JSON object with this exact format:
{
  "category": "<one of the categories above or 'Uncategorized'>",
  "value": "${selectedText}",
  "confidence": "<high/medium/low>"
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a precise legal citation classifier. Always respond with valid JSON only." },
          { role: "user", content: classificationPrompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    
    // Extract JSON from response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse AI response");
    }
    
    const classification = JSON.parse(jsonMatch[0]);

    return new Response(
      JSON.stringify({
        category: classification.category,
        value: classification.value,
        confidence: classification.confidence,
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
