import { useEffect, useState } from "react";
import type { CitationEntry } from "@/types/citation";

interface PdfHighlightLayerProps {
  citations: CitationEntry[];
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  textContent: any;
  viewport: any;
  hoveredCitation: number | null;
  scale?: number;
  searchTerm?: string;
}

interface Highlight {
  left: number;
  top: number;
  width: number;
  height: number;
  citationIndex: number;
  text: string;
}

export const PdfHighlightLayer = ({
  citations,
  pageNumber,
  pageWidth,
  pageHeight,
  textContent,
  viewport,
  hoveredCitation,
  scale = 1,
  searchTerm = "",
}: PdfHighlightLayerProps) => {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [searchHighlights, setSearchHighlights] = useState<Highlight[]>([]);

  const normalize = (t: string) =>
    t
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^\w\s\-]/g, "")
      .trim();

  // -------------------------------------------------------------------
  // CLEAN + CONSISTENT BOUNDING BOX
  // -------------------------------------------------------------------
  const getBoundingBox = (items: any[]): Highlight => {
    const xs = items.map(i => i.transform[4]);
    const widths = items.map(i => i.width);
    const baselines = items.map(i => i.transform[5]);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs.map((x, i) => x + widths[i]));

    const first = items[0];
    const textHeight =
      first.height ||
      Math.abs(first.transform[3]) ||
      12;

    const minBaseline = Math.min(...baselines);

    return {
      left: minX,
      top: pageHeight - minBaseline - textHeight,
      width: maxX - minX,
      height: textHeight,
      citationIndex: -1,
      text: "",
    };
  };

  // -------------------------------------------------------------------
  // CITATION HIGHLIGHTING (NO DUPLICATE MATCHES)
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!textContent || !viewport) return;

    const textItems = textContent.items;
    const newHighlights: Highlight[] = [];

    citations.forEach((citation, citationIndex) => {
      const searchTexts = [
        citation["Non-Bates Exhibits"],
        citation.Depositions,
        citation.BatesBegin,
        citation.BatesEnd,
        citation.Pinpoint,
        citation["Code Lines"],
        citation.cites,
      ].filter(t => t && t !== "nan" && t.length > 3);

      searchTexts.forEach(searchText => {
        const normalizedSearch = normalize(searchText);
        const parts = normalizedSearch.split(" ").filter(w => w.length > 2);

        let start = 0;

        while (start < textItems.length) {
          let combo = "";
          let matchedItems: any[] = [];
          let matched = false;

          for (let end = start; end < Math.min(start + 10, textItems.length); end++) {
            const item = textItems[end];
            if (!item.str) continue;

            combo += " " + item.str;
            matchedItems.push(item);

            const normCombo = normalize(combo);

            const hit =
              normCombo.includes(normalizedSearch) ||
              (parts.length > 1 && parts.every(w => normCombo.includes(w)));

            if (hit) {
              const box = getBoundingBox(matchedItems);
              box.citationIndex = citationIndex;
              box.text = searchText;

              newHighlights.push(box);

              start = end + 1; // IMPORTANT: prevents duplicates
              matched = true;
              break;
            }
          }

          if (!matched) start++;
        }
      });
    });

    setHighlights(newHighlights);
  }, [citations, textContent, viewport, pageHeight]);

  // -------------------------------------------------------------------
  // SEARCH TERM HIGHLIGHTING (NO DUPLICATE MATCHES)
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!textContent || !viewport || !searchTerm || searchTerm.trim().length < 2) {
      setSearchHighlights([]);
      return;
    }

    const textItems = textContent.items;
    const normalizedSearch = normalize(searchTerm);
    const parts = normalizedSearch.split(" ").filter(w => w.length > 2);

    const results: Highlight[] = [];
    let start = 0;

    while (start < textItems.length) {
      let combo = "";
      let matchedItems: any[] = [];
      let matched = false;

      for (let end = start; end < Math.min(start + 10, textItems.length); end++) {
        const item = textItems[end];
        if (!item.str) continue;

        combo += " " + item.str;
        matchedItems.push(item);

        const normCombo = normalize(combo);

        const hit =
          normCombo.includes(normalizedSearch) ||
          (parts.length > 1 && parts.every(w => normCombo.includes(w)));

        if (hit) {
          const box = getBoundingBox(matchedItems);
          box.text = searchTerm;

          results.push(box);

          start = end + 1; // skip ahead to prevent duplicates
          matched = true;
          break;
        }
      }

      if (!matched) start++;
    }

    setSearchHighlights(results);
  }, [searchTerm, textContent, viewport, pageHeight]);

  // -------------------------------------------------------------------
  // COLOR FOR CITATIONS (SOFTER)
  // -------------------------------------------------------------------
  const getColor = (index: number) => {
    const colors = [
      "rgba(255, 235, 59, 0.2)",
      "rgba(76, 175, 80, 0.2)",
      "rgba(33, 150, 243, 0.2)",
      "rgba(255, 152, 0, 0.2)",
      "rgba(156, 39, 176, 0.2)",
      "rgba(244, 67, 54, 0.2)",
    ];
    return colors[index % colors.length];
  };

  return (
    <div
      className="absolute top-0 left-0 pointer-events-none"
      style={{ width: pageWidth * scale, height: pageHeight * scale }}
    >

      {/* SEARCH HIGHLIGHTS */}
      {searchHighlights.map((h, i) => (
        <div
          key={`search-${i}`}
          className="absolute"
          style={{
            left: h.left * scale,
            top: h.top * scale,
            width: h.width * scale,
            height: h.height * scale,
            backgroundColor: "rgba(255, 255, 0, 0.08)",
            border: "1px solid rgba(255, 255, 0, 0.15)",
            zIndex: 20,
          }}
        />
      ))}

      {/* CITATION HIGHLIGHTS */}
      {highlights.map((h, i) => (
        <div
          key={`citation-${i}`}
          className="absolute transition-all duration-200"
          style={{
            left: h.left * scale,
            top: h.top * scale,
            width: h.width * scale,
            height: h.height * scale,
            backgroundColor: getColor(h.citationIndex),
            border:
              hoveredCitation === h.citationIndex
                ? "2px solid rgba(0,0,0,0.4)"
                : "none",
            opacity:
              hoveredCitation === null || hoveredCitation === h.citationIndex
                ? 1
                : 0.35,
            transform:
              hoveredCitation === h.citationIndex ? "scale(1.04)" : "scale(1)",
            zIndex: hoveredCitation === h.citationIndex ? 30 : 10,
          }}
        />
      ))}
    </div>
  );
};
