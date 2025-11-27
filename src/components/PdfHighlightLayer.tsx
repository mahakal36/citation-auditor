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
}: PdfHighlightLayerProps) => {
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  useEffect(() => {
    if (!textContent || !viewport) return;

    const newHighlights: Highlight[] = [];
    const textItems = textContent.items;

    // Normalize text for better matching
    const normalizeText = (text: string) => {
      return text
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s\-]/g, '')
        .trim();
    };

    citations.forEach((citation, citationIndex) => {
      const searchTexts = [
        citation["Non-Bates Exhibits"],
        citation.Depositions,
        citation.BatesBegin,
        citation.BatesEnd,
        citation.Pinpoint,
        citation["Code Lines"],
        citation.cites,
      ].filter((text) => text && text !== "nan" && text.length > 3);

      searchTexts.forEach((searchText) => {
        const normalizedSearch = normalizeText(searchText);
        const searchWords = normalizedSearch.split(' ').filter(w => w.length > 2);
        
        // Try to find consecutive text items that form the search string
        for (let startIdx = 0; startIdx < textItems.length; startIdx++) {
          let combinedText = '';
          let matchedItems: any[] = [];
          
          // Look ahead to combine multiple text items (up to 10 items)
          for (let endIdx = startIdx; endIdx < Math.min(startIdx + 10, textItems.length); endIdx++) {
            const item = textItems[endIdx];
            if (!item.str) continue;
            
            combinedText += ' ' + item.str;
            matchedItems.push(item);
            
            const normalizedCombined = normalizeText(combinedText);
            
            // Check if we have a match (either exact or all words present)
            if (normalizedCombined.includes(normalizedSearch) || 
                (searchWords.length > 1 && searchWords.every(word => normalizedCombined.includes(word)))) {
              
              // Calculate bounding box for all matched items
              const transforms = matchedItems.map(i => i.transform);
              const xs = transforms.map(t => t[4]);
              const ys = transforms.map(t => t[5]);
              const widths = matchedItems.map(i => i.width || 100);
              const heights = matchedItems.map((i, idx) => 
                Math.sqrt(transforms[idx][2] * transforms[idx][2] + transforms[idx][3] * transforms[idx][3])
              );
              
              const minX = Math.min(...xs);
              const maxX = Math.max(...xs.map((x, i) => x + widths[i]));
              const minY = Math.min(...ys);
              const maxHeight = Math.max(...heights);
              
              newHighlights.push({
                left: minX,
                top: pageHeight - minY - maxHeight,
                width: maxX - minX,
                height: maxHeight,
                citationIndex,
                text: searchText,
              });
              
              break; // Found match, stop looking for this search text
            }
          }
        }
      });
    });

    setHighlights(newHighlights);
  }, [citations, textContent, viewport, pageHeight]);

  // Generate color based on citation index
  const getColor = (index: number) => {
    const colors = [
      "rgba(255, 235, 59, 0.4)",  // Yellow
      "rgba(76, 175, 80, 0.4)",   // Green
      "rgba(33, 150, 243, 0.4)",  // Blue
      "rgba(255, 152, 0, 0.4)",   // Orange
      "rgba(156, 39, 176, 0.4)",  // Purple
      "rgba(244, 67, 54, 0.4)",   // Red
    ];
    return colors[index % colors.length];
  };

  return (
    <div
      className="absolute top-0 left-0 pointer-events-none"
      style={{ width: pageWidth, height: pageHeight }}
    >
      {highlights.map((highlight, idx) => (
        <div
          key={idx}
          className="absolute transition-all duration-200"
          style={{
            left: highlight.left,
            top: highlight.top,
            width: highlight.width,
            height: highlight.height,
            backgroundColor: getColor(highlight.citationIndex),
            border:
              hoveredCitation === highlight.citationIndex
                ? "2px solid rgba(0, 0, 0, 0.5)"
                : "none",
            opacity: hoveredCitation === null || hoveredCitation === highlight.citationIndex ? 1 : 0.3,
            transform:
              hoveredCitation === highlight.citationIndex
                ? "scale(1.05)"
                : "scale(1)",
            zIndex: hoveredCitation === highlight.citationIndex ? 10 : 1,
          }}
          title={`Citation ${highlight.citationIndex + 1}: ${highlight.text}`}
        />
      ))}
    </div>
  );
};
