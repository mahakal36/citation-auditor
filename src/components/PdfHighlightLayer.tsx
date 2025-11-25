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

    // Extract all text items with their positions
    const textItems = textContent.items;

    citations.forEach((citation, citationIndex) => {
      // Try to find citation text in the PDF
      const searchTexts = [
        citation.Exhibits,
        citation.deponent,
        citation.BatesBegin,
        citation.BatesEnd,
        citation.Pinpoint,
      ].filter((text) => text && text !== "nan" && text.length > 3);

      searchTexts.forEach((searchText) => {
        for (let i = 0; i < textItems.length; i++) {
          const item = textItems[i];
          const itemText = item.str.toLowerCase();
          
          if (itemText.includes(searchText.toLowerCase())) {
            const transform = item.transform;
            const x = transform[4];
            const y = transform[5];
            const height = Math.sqrt(transform[2] * transform[2] + transform[3] * transform[3]);
            const width = item.width;

            newHighlights.push({
              left: x,
              top: pageHeight - y - height,
              width: width,
              height: height,
              citationIndex,
              text: searchText,
            });
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
