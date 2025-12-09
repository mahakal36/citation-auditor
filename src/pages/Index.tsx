import { useState, useCallback, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CitationTable } from "@/components/CitationTable";
import { PdfHighlightLayer } from "@/components/PdfHighlightLayer";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Upload, Download, Sparkles, ZoomIn, ZoomOut, RotateCcw, Save, FileStack, Plus, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";
import type { CitationEntry } from "@/types/citation";
import logo from "@/assets/logo.png";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const Index = () => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [pageData, setPageData] = useState<Record<number, CitationEntry[]>>({});
  const [allSavedData, setAllSavedData] = useState<CitationEntry[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [pageTextContent, setPageTextContent] = useState<any>(null);
  const [pageViewport, setPageViewport] = useState<any>(null);
  const [pageDimensions, setPageDimensions] = useState({ width: 0, height: 0 });
  const [hoveredCitation, setHoveredCitation] = useState<number | null>(null);
  // Removed: few-shot learning storage per request
  const [isClassifying, setIsClassifying] = useState(false);
  const [pdfScale, setPdfScale] = useState(1.0);
  const [selectionRects, setSelectionRects] = useState<Array<{ left: number; top: number; width: number; height: number }>>([]);
  const [lastSelectedText, setLastSelectedText] = useState("");
  const pdfWrapperRef = useRef<HTMLDivElement | null>(null);
  const [targetRowIndex, setTargetRowIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const currentData = pageData[pageNumber] || [];

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    toast({
      title: "PDF Loaded",
      description: `Successfully loaded ${numPages} pages`,
    });
  };

  const onPageLoadSuccess = useCallback(async (page: any) => {
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    setPageTextContent(textContent);
    setPageViewport(viewport);
    setPageDimensions({ width: viewport.width, height: viewport.height });
  }, []);

  // Clear selection highlights when page changes
  useEffect(() => {
    setSelectionRects([]);
    setLastSelectedText("");
    setTargetRowIndex(null);
  }, [pageNumber]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
      setPageNumber(1);
      setPageData({});
      setAllSavedData([]);
    } else {
      toast({
        title: "Invalid File",
        description: "Please upload a PDF file",
        variant: "destructive",
      });
    }
  };

  const extractPageData = useCallback(async () => {
    if (!pdfFile) {
      toast({
        title: "No PDF",
        description: "Please upload a PDF first",
        variant: "destructive",
      });
      return;
    }

    setIsExtracting(true);
    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(pageNumber);
      
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-citations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pageText,
            pageNumber,
            reportName: pdfFile.name,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Extraction failed");
      }

      const data = await response.json();
      setPageData(prev => ({
        ...prev,
        [pageNumber]: data.citations || []
      }));
      
      toast({
        title: "Extraction Complete",
        description: `Extracted ${data.citations?.length || 0} citations from page ${pageNumber}`,
      });
    } catch (error) {
      console.error("Extraction error:", error);
      toast({
        title: "Extraction Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsExtracting(false);
    }
  }, [pdfFile, pageNumber, toast]);

  const handleSavePageData = useCallback(() => {
    if (currentData.length === 0) {
      toast({
        title: "No Data",
        description: "No data to save for this page",
        variant: "destructive",
      });
      return;
    }

    setAllSavedData((prev) => {
      const existingFromPage = prev.filter(item => item["Paragraph No."] !== pageNumber);
      return [...existingFromPage, ...currentData];
    });
    
    toast({
      title: "Data Saved",
      description: `Saved ${currentData.length} citations from page ${pageNumber}`,
    });
  }, [currentData, pageNumber, toast]);

  const extractBatchPages = useCallback(async () => {
    if (!pdfFile || numPages === 0) {
      toast({
        title: "No PDF",
        description: "Please upload a PDF first",
        variant: "destructive",
      });
      return;
    }

    setIsBatchProcessing(true);
    const startPage = pageNumber;
    const endPage = Math.min(pageNumber + 9, numPages);
    
    toast({
      title: "Batch Processing",
      description: `Processing pages ${startPage} to ${endPage}...`,
    });

    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      
      for (let i = startPage; i <= endPage; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(" ");

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-citations`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pageText,
              pageNumber: i,
              reportName: pdfFile.name,
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          setPageData(prev => ({
            ...prev,
            [i]: data.citations || []
          }));
        }
      }
      
      toast({
        title: "Batch Complete",
        description: `Processed pages ${startPage} to ${endPage}`,
      });
    } catch (error) {
      console.error("Batch processing error:", error);
      toast({
        title: "Batch Processing Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsBatchProcessing(false);
    }
  }, [pdfFile, pageNumber, numPages, toast]);

  const handleDownloadCSV = useCallback(() => {
    if (allSavedData.length === 0) {
      toast({
        title: "No Data",
        description: "No saved data to download",
        variant: "destructive",
      });
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(allSavedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Citations");
    
    XLSX.writeFile(workbook, `${pdfFile?.name.replace('.pdf', '')}_citations.xlsx`);

    toast({
      title: "Excel Downloaded",
      description: `Downloaded ${allSavedData.length} total citations`,
    });
  }, [allSavedData, pdfFile, toast]);

  // Reference Excel loading removed per request (manual data only)

  const handleTextSelection = useCallback(async () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    
    if (!selectedText || selectedText.length < 2 || !pdfFile) {
      setSelectionRects([]);
      return;
    }

    // Compute exact selection rectangles relative to the PDF wrapper
    try {
      const range = selection!.rangeCount > 0 ? selection!.getRangeAt(0) : null;
      const wrapper = pdfWrapperRef.current;
      if (range && wrapper) {
        const wrapperRect = wrapper.getBoundingClientRect();
        const rects: Array<{ left: number; top: number; width: number; height: number }> = [];
        const clientRects = Array.from(range.getClientRects());
        for (const r of clientRects) {
          // Skip zero-sized rects
          if (r.width <= 0 || r.height <= 0) continue;
          rects.push({
            left: r.left - wrapperRect.left,
            top: r.top - wrapperRect.top,
            width: r.width,
            height: r.height,
          });
        }
        setSelectionRects(rects);
        setLastSelectedText(selectedText);
      }
    } catch (_) {
      // Best-effort highlighting; ignore DOM selection errors
    }

    setIsClassifying(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/classify-text`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selectedText,
            pageNumber,
            reportName: pdfFile.name,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Classification failed");
      }

      const data = await response.json();
      // Defensive logging to surface category/value mismatches during dev
      console.debug("classification result", data);
      
      const rawCategory: string = (data.category || "").toString();
      const selectedValue: string = (data.value || selectedText).toString();

      const normalizeKey = (s: string) =>
        s
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "") // remove spaces, punctuation
          .trim();

      // Map multiple possible category spellings to canonical fields
      const categoryKey = normalizeKey(rawCategory);

      const canonicalMap: Record<string, keyof CitationEntry | "__range__" | "__begin__" | "__end__"> = {
        nonbatesexhibits: "Non-Bates Exhibits",
        exhibit: "Non-Bates Exhibits",
        exhibits: "Non-Bates Exhibits",
        depositions: "Depositions",
        deposition: "Depositions",
        date: "date",
        cites: "cites",
        citation: "cites",
        citations: "cites",
        batesbegin: "__begin__",
        batesstart: "__begin__",
        startbates: "__begin__",
        batesend: "__end__",
        batesstop: "__end__",
        endbates: "__end__",
        batesrange: "__range__",
        pinpoint: "Pinpoint",
        pinpoints: "Pinpoint",
        pinpointcite: "Pinpoint",
        codelines: "Code Lines",
        lines: "Code Lines",
        reportname: "Report Name",
        report: "Report Name",
        parano: "Paragraph No.",
        parno: "Paragraph No.",
        paragraph: "Paragraph No.",
        paragraphno: "Paragraph No.",
        paragraphnumber: "Paragraph No.",
      };

      const canonical = canonicalMap[categoryKey];

      // ---------- Local fallback detectors (handles combined strings like "TOT...-.. at TOT..." ) ----------
      const extractPinpointFrom = (t: string): string | null => {
        const m = t.match(/\bat\s+([A-Z0-9_]*\d{1,}|\d{1,3}:\d{1,2}(?:[–\-]\d{1,3}:\d{1,2})?)/i);
        return m ? m[1] : null;
      };
      const extractRange = (t: string): { begin?: string; end?: string } | null => {
        const m = t.match(/([A-Z0-9_]*\d{3,})\s*[-–]\s*([A-Z0-9_]*\d{1,})/i);
        return m ? { begin: m[1], end: m[2] } : null;
      };
      const extractSingleBates = (t: string): string | null => {
        const m = t.match(/\b[A-Z][A-Z0-9_]*\d{3,}\b/);
        return m ? m[0] : null;
      };
      const isCites = (t: string) => /\b\d{1,3}:\d{1,2}(?:[–\-]\d{1,3}:\d{1,2})?\b/.test(t);
      const isDate = (t: string) => /\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{2,4})\b/i.test(t);
      const isCodeLines = (t: string) => /\blines?\s+\d+(?:[–\-]\d+)?\b/i.test(t) || /\baccessed\s+/i.test(t);
      const looksLikeUrl = (t: string) => /(https?:\/\/|www\.)/i.test(t);
      const has3Words = (t: string) => t.trim().split(/\s+/).length >= 3;

      // Heuristic 0: If selection is just a Bates-like code and current row has Begin filled but End empty, set End
      const isBatesLike = (t: string) => /^[A-Z][A-Z0-9_]*\d{3,}$/i.test(t);
      const isNumeric = (t: string) => /^\d{1,6}$/.test(t);
      const isPinLike = (t: string) => /^(\d{1,3}:\d{1,2}(?:[–\-]\d{1,3}:\d{1,2})?|\d{1,4})$/.test(t);

      const trySetDirectly = (updater: (row: CitationEntry) => CitationEntry | null) => {
        setPageData(prev => {
          const list = [...(prev[pageNumber] || [])];
          let idx: number | null = null;
          if (targetRowIndex !== null && list[targetRowIndex]) idx = targetRowIndex;
          if (idx === null) {
            // fallback to last row
            idx = list.length > 0 ? list.length - 1 : null;
          }
          if (idx !== null) {
            const updated = updater(list[idx]);
            if (updated) {
              list[idx] = updated;
              setTargetRowIndex(idx);
              return { ...prev, [pageNumber]: list };
            }
          }
          return prev;
        });
      };

      // 0a) If numeric suffix and we have BatesBegin but no BatesEnd: compute suffix expansion
      if (isNumeric(selectedValue)) {
        let handled = false;
        trySetDirectly((row) => {
          if (row.BatesBegin && !row.BatesEnd) {
            const begin = row.BatesBegin;
            const tailDigits = begin.match(/(\d+)$/)?.[1] || "";
            if (tailDigits) {
              const suffix = selectedValue;
              const newEnd = begin.slice(0, begin.length - suffix.length) + suffix;
              handled = true;
              return { ...row, BatesEnd: newEnd };
            }
          }
          return null;
        });
        if (handled) {
          toast({ title: "Bates End Added", description: selectedValue });
          setIsClassifying(false);
          return; // done
        }
      }

      // 0b) If Bates-like and we have Begin but not End, set End
      if (isBatesLike(selectedValue)) {
        let handled = false;
        trySetDirectly((row) => {
          if (row.BatesBegin && !row.BatesEnd) {
            handled = true;
            return { ...row, BatesEnd: selectedValue };
          }
          return null;
        });
        if (handled) {
          toast({ title: "Bates End Added", description: selectedValue });
          setIsClassifying(false);
          return;
        }
      }

      // 0c) If selection looks like a Pinpoint and current row has Bates or Non-Bates, set Pinpoint if empty
      if (isPinLike(selectedValue)) {
        let handled = false;
        trySetDirectly((row) => {
          const hasContext = !!row.BatesBegin || !!row["Non-Bates Exhibits"]; // something to pin to
          if (hasContext && !row.Pinpoint) {
            handled = true;
            return { ...row, Pinpoint: selectedValue };
          }
          return null;
        });
        if (handled) {
          toast({ title: "Pinpoint Added", description: selectedValue });
          setIsClassifying(false);
          return;
        }
      }

      let effCategory = rawCategory;
      let effBatesBegin: string | null = data.batesBegin || null;
      let effBatesEnd: string | null = data.batesEnd || null;

      if (!canonical || categoryKey === "uncategorized") {
        const r = extractRange(selectedValue);
        if (r?.begin && r.end) {
          effCategory = "Bates Range";
          effBatesBegin = r.begin;
          effBatesEnd = r.end;
        } else {
          const single = extractSingleBates(selectedValue);
          if (single) {
            effCategory = "Bates Begin";
            effBatesBegin = single;
          } else if (isCites(selectedValue)) {
            effCategory = "Cites";
          } else if (isCodeLines(selectedValue)) {
            effCategory = "Code Lines";
          } else if (isDate(selectedValue)) {
            effCategory = "Date";
          } else if (looksLikeUrl(selectedValue) || has3Words(selectedValue)) {
            effCategory = "Non-Bates Exhibits";
          }
        }
      }

      const effKey = normalizeKey(effCategory);
      let effCanonical = canonicalMap[effKey];

      // Context-aware override: if a target row is selected (or there is at least one row),
      // prefer filling the most sensible field based on current row state and the selected text
      const pickContextualField = (rows: CitationEntry[]): keyof CitationEntry | null => {
        const idx = targetRowIndex !== null ? targetRowIndex : (rows.length > 0 ? rows.length - 1 : -1);
        if (idx < 0) return null;
        const row = rows[idx];
        const onlyDigits = /^\d{1,4}$/;
        const batesToken = /^[A-Z][A-Z0-9_]*\d{3,}$/i; // e.g., TOT00191805
        const pageLine = /^\d{1,3}:\d{1,2}$/; // e.g., 2:35

        // If BatesBegin empty and selection looks like a Bates token → BatesBegin
        if (!row?.BatesBegin && batesToken.test(selectedValue)) return "BatesBegin";

        // If we already have BatesBegin and BatesEnd is empty:
        //  - If selection is only digits (suffix) OR a full Bates token → BatesEnd
        if (row?.BatesBegin && !row?.BatesEnd && (onlyDigits.test(selectedValue) || batesToken.test(selectedValue))) {
          return "BatesEnd";
        }

        // If we have BatesBegin AND BatesEnd and Pinpoint is empty, and selection looks like a Bates token or page:line → Pinpoint
        if (row?.BatesBegin && row?.BatesEnd && !row?.Pinpoint && (batesToken.test(selectedValue) || pageLine.test(selectedValue))) {
          return "Pinpoint";
        }

        // If selection contains a URL → always Non-Bates Exhibits (per requirement)
        if (looksLikeUrl(selectedValue)) return "Non-Bates Exhibits";

        return null;
      };

      if (effCategory && effKey !== "uncategorized" && effCanonical) {
        const newEntry: CitationEntry = {
          "Non-Bates Exhibits": "",
          "Depositions": "",
          "date": "",
          "cites": "",
          "BatesBegin": "",
          "BatesEnd": "",
          "Pinpoint": "",
          "Code Lines": "",
          "Report Name": pdfFile.name,
          "Paragraph No.": 0,
        };

        // Bates range (explicit or fallback)
        if (effCanonical === "__range__" && effBatesBegin && effBatesEnd) {
          newEntry.BatesBegin = effBatesBegin;
          newEntry.BatesEnd = effBatesEnd;
          const pin = extractPinpointFrom(selectedValue);
          if (pin) newEntry.Pinpoint = pin;

          setPageData(prev => {
            const list = [...(prev[pageNumber] || [])];
            let chosenIndex: number | null = null;
            const tryRow = (idx: number) => {
              const row = list[idx];
              if (!row) return false;
              const beginEmpty = !row.BatesBegin;
              const endEmpty = !row.BatesEnd;
              if (beginEmpty && endEmpty) {
                const pin = extractPinpointFrom(selectedValue);
                list[idx] = { ...row, BatesBegin: newEntry.BatesBegin, BatesEnd: newEntry.BatesEnd, ...(pin ? { Pinpoint: pin } : {}) };
                chosenIndex = idx;
                return true;
              }
              return false;
            };

            let merged = false;
            if (targetRowIndex !== null) {
              merged = tryRow(targetRowIndex);
            }
            if (!merged) {
              // Fallback: last row missing both
              for (let i = list.length - 1; i >= 0; i--) {
                if (tryRow(i)) { merged = true; break; }
              }
            }
            if (!merged) {
              list.push(newEntry);
              chosenIndex = list.length - 1;
            }
            // Lock future classifications to this row
            if (chosenIndex !== null) setTargetRowIndex(chosenIndex);
            return { ...prev, [pageNumber]: list };
          });

          toast({
            title: "Bates Range Added",
            description: `Begin: ${data.batesBegin}, End: ${data.batesEnd}`,
          });
        } else if (effCanonical === "__begin__" || effCanonical === "__end__") {
          const targetField = effCanonical === "__begin__" ? "BatesBegin" : "BatesEnd";
          const value = effCanonical === "__begin__" && effBatesBegin ? effBatesBegin : selectedValue;
          setPageData(prev => {
            const list = [...(prev[pageNumber] || [])];
            let chosenIndex: number | null = null;
            const canFill = (idx: number) => {
              const row = list[idx];
              if (!row) return false;
              const val = row[targetField] as any;
              return val === "" || val === undefined || val === null || (typeof val === "number" && val === 0);
            };

            let merged = false;
            if (targetRowIndex !== null && canFill(targetRowIndex)) {
              const pin = extractPinpointFrom(selectedValue);
              list[targetRowIndex] = { ...list[targetRowIndex], [targetField]: value, ...(pin ? { Pinpoint: pin } : {}) } as CitationEntry;
              merged = true;
              chosenIndex = targetRowIndex;
            }
            if (!merged) {
              // Fallback: most recent row with empty targetField
              for (let i = list.length - 1; i >= 0; i--) {
                if (canFill(i)) {
                  const pin = extractPinpointFrom(selectedValue);
                  list[i] = { ...list[i], [targetField]: value, ...(pin ? { Pinpoint: pin } : {}) } as CitationEntry;
                  merged = true;
                  chosenIndex = i;
                  break;
                }
              }
            }
            if (!merged) {
              const pin = extractPinpointFrom(selectedValue);
              list.push({ ...newEntry, [targetField]: value, ...(pin ? { Pinpoint: pin } : {}) });
              chosenIndex = list.length - 1;
            }
            if (chosenIndex !== null) setTargetRowIndex(chosenIndex);
            return { ...prev, [pageNumber]: list };
          });
        } else {
          // Regular single-field categories (context takes priority over model category)
          let chosenField: keyof CitationEntry | undefined = pickContextualField(pageData[pageNumber] || []) as keyof CitationEntry | undefined;
          if (!chosenField) {
            chosenField = effCanonical as keyof CitationEntry | undefined;
          }
          if (!chosenField) {
            const pageLine = /^\d{1,3}:\d{1,2}$/;
            const batesToken = /^[A-Z][A-Z0-9_]*\d{3,}$/i;
            if (pageLine.test(selectedValue) || batesToken.test(selectedValue)) {
              chosenField = "Pinpoint";
            } else if (/^\d{1,4}$/.test(selectedValue)) {
              chosenField = "BatesEnd";
            } else if (looksLikeUrl(selectedValue)) {
              chosenField = "Non-Bates Exhibits";
            } else {
              chosenField = "Non-Bates Exhibits";
            }
          }

          const field = chosenField as keyof CitationEntry;
          let value: any = field === "Paragraph No." ? parseInt(selectedValue) || 0 : selectedValue;

          // If Non-Bates Exhibits contains "at <pin>", split and also set Pinpoint
          const inlinePin = extractPinpointFrom(selectedValue);
          if (field === "Non-Bates Exhibits" && inlinePin && looksLikeUrl(selectedValue)) {
            value = selectedValue.replace(/\bat\s+[A-Z0-9_]*\d{1,}|\bat\s+\d{1,3}:\d{1,2}(?:[–\-]\d{1,3}:\d{1,2})?/i, "").trim();
          }

          // If selection contains a URL, always create a NEW row for Non-Bates Exhibits (per requirement)
          if (field === "Non-Bates Exhibits" && looksLikeUrl(selectedValue)) {
            setPageData(prev => {
              const list = [...(prev[pageNumber] || [])];
              const base = { ...newEntry, [field]: value } as CitationEntry;
              if (inlinePin) {
                (base as any).Pinpoint = inlinePin;
              }
              list.push(base);
              const idx = list.length - 1;
              setTargetRowIndex(idx);
              return { ...prev, [pageNumber]: list };
            });
            toast({ title: "Citation Added", description: "Added as Non-Bates Exhibits (new row)" });
            return;
          }
          setPageData(prev => {
            const list = [...(prev[pageNumber] || [])];
            let chosenIndex: number | null = null;
            const canFill = (idx: number) => {
              const row = list[idx];
              if (!row) return false;
              const val = row[field] as any;
              return val === "" || val === undefined || val === null || (typeof val === "number" && val === 0);
            };

            const forceNewRowForUrl = field === "Non-Bates Exhibits" && looksLikeUrl(selectedValue);

            let merged = false;
            if (!forceNewRowForUrl && targetRowIndex !== null && canFill(targetRowIndex)) {
              const base = { ...list[targetRowIndex], [field]: value } as CitationEntry;
              if (field === "Non-Bates Exhibits" && inlinePin && looksLikeUrl(selectedValue) && !base.Pinpoint) {
                base.Pinpoint = inlinePin;
              }
              list[targetRowIndex] = base;
              merged = true;
              chosenIndex = targetRowIndex;
            }
            if (!merged && !forceNewRowForUrl) {
              // Fallback: most recent row with empty field
              for (let i = list.length - 1; i >= 0; i--) {
                if (canFill(i)) {
                  const base = { ...list[i], [field]: value } as CitationEntry;
                  if (field === "Non-Bates Exhibits" && inlinePin && looksLikeUrl(selectedValue) && !base.Pinpoint) {
                    base.Pinpoint = inlinePin;
                  }
                  list[i] = base;
                  merged = true;
                  chosenIndex = i;
                  break;
                }
              }
            }
            if (!merged) {
              const base = { ...newEntry, [field]: value } as CitationEntry;
              if (field === "Non-Bates Exhibits" && inlinePin && looksLikeUrl(selectedValue)) {
                (base as any).Pinpoint = inlinePin;
              }
              list.push(base);
              chosenIndex = list.length - 1;
            }
            if (chosenIndex !== null) setTargetRowIndex(chosenIndex);
            return { ...prev, [pageNumber]: list };
          });
        }

        toast({
          title: "Citation Added",
          description: `Added as ${effCategory}`,
        });
      } else {
        toast({
          title: "Not a Citation",
          description: "Selected text didn't match any known category",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Classification error:", error);
      toast({
        title: "Classification Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsClassifying(false);
    }
  }, [pdfFile, pageNumber, toast]);

  const handleAddRawRow = useCallback(() => {
    const emptyRow: CitationEntry = {
      "Non-Bates Exhibits": "",
      "Depositions": "",
      "date": "",
      "cites": "",
      "BatesBegin": "",
      "BatesEnd": "",
      "Pinpoint": "",
      "Code Lines": "",
      "Report Name": pdfFile?.name || "",
      "Paragraph No.": 0,
    };
    setPageData(prev => {
      const list = [...(prev[pageNumber] || []), emptyRow];
      // Lock selection to the new row so subsequent classifications fill it
      setTargetRowIndex(list.length - 1);
      return { ...prev, [pageNumber]: list };
    });
    toast({
      title: "Row Added",
      description: "Empty row added to the table",
    });
  }, [pdfFile, pageNumber, toast]);

  const handleClearAll = useCallback(() => {
    setPageData(prev => ({
      ...prev,
      [pageNumber]: []
    }));
    setTargetRowIndex(null);
    toast({
      title: "Cleared",
      description: "All citations cleared from this page",
    });
  }, [pageNumber, toast]);

  return (
    <TooltipProvider>
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        {/* Compact Header */}
        <header className="flex items-center justify-between px-4 py-2 border-b bg-card shrink-0">
          <div className="flex items-center gap-2">
            <img
              src={logo}
              alt="Logo"
              className="h-8 w-auto object-contain flex-shrink-0"
              style={{ maxWidth: "160px" }}
            />

            <h1 className="text-base font-semibold tracking-tight text-foreground">
              Exhibit Extraction
            </h1>
          </div>
          
          <div className="flex items-center gap-1.5">
            {/* Removed: Load Reference Excel button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <label htmlFor="pdf-upload" className="cursor-pointer">
                  <div className="flex items-center justify-center w-8 h-8 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
                    <Upload className="w-4 h-4" />
                  </div>
                  <Input
                    id="pdf-upload"
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </TooltipTrigger>
              <TooltipContent>Upload PDF</TooltipContent>
            </Tooltip>

            {pdfFile && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={extractPageData}
                      disabled={isExtracting || isBatchProcessing}
                      size="icon"
                      className="w-8 h-8"
                    >
                      <Sparkles className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isExtracting ? "Extracting..." : "Extract Page"}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={extractBatchPages}
                      disabled={isExtracting || isBatchProcessing}
                      variant="outline"
                      size="icon"
                      className="w-8 h-8"
                    >
                      <FileStack className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isBatchProcessing ? "Processing..." : "Extract 10 Pages"}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleSavePageData}
                      variant="secondary"
                      size="icon"
                      className="w-8 h-8"
                      disabled={currentData.length === 0}
                    >
                      <Save className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Save Page Data</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleDownloadCSV}
                      variant="outline"
                      size="icon"
                      className="w-8 h-8 relative"
                      disabled={allSavedData.length === 0}
                    >
                      <Download className="w-4 h-4" />
                      {allSavedData.length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                          {allSavedData.length}
                        </span>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download Excel ({allSavedData.length})</TooltipContent>
                </Tooltip>
                
                <span className="text-xs text-muted-foreground ml-2 truncate max-w-[120px]" title={pdfFile.name}>
                  {pdfFile.name}
                </span>
              </>
            )}
          </div>
        </header>

        {/* Main Content */}
        {pdfFile ? (
          <ResizablePanelGroup direction="horizontal" className="flex-1">
            {/* PDF Viewer - Scrollable */}
            <ResizablePanel defaultSize={45} minSize={30}>
              <div className="h-full flex flex-col overflow-hidden bg-muted/30">
                {/* Fixed PDF Header */}
                <div className="px-3 py-2 border-b bg-card shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    {/* Progress & Page Navigation */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-primary font-medium">
                          {numPages > 0 ? Math.round((pageNumber / numPages) * 100) : 0}%
                        </span>
                        <span className="text-muted-foreground">Page</span>
                        <Input
                          type="number"
                          value={pageNumber}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (val >= 1 && val <= numPages) {
                              setPageNumber(val);
                            }
                          }}
                          className="w-12 h-6 text-xs text-center px-1"
                          min={1}
                          max={numPages}
                        />
                        <span className="text-muted-foreground">of {numPages}</span>
                      </div>
                      
                      <div className="flex items-center gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                              disabled={pageNumber <= 1}
                            >
                              <ChevronLeft className="w-3 h-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Previous Page</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
                              disabled={pageNumber >= numPages}
                            >
                              <ChevronRight className="w-3 h-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Next Page</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>

                    {/* Zoom Controls */}
                    <div className="flex items-center gap-0.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setPdfScale(s => Math.max(0.5, s - 0.1))}
                          >
                            <ZoomOut className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Zoom Out</TooltipContent>
                      </Tooltip>
                      <span className="text-xs text-muted-foreground min-w-[32px] text-center">
                        {Math.round(pdfScale * 100)}%
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setPdfScale(s => Math.min(2.0, s + 0.1))}
                          >
                            <ZoomIn className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Zoom In</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setPdfScale(1.0)}
                          >
                            <RotateCcw className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Reset Zoom</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>
                
                {/* Scrollable PDF Container */}
                <div 
                  className="flex-1 overflow-auto relative"
                  onMouseUp={handleTextSelection}
                >
                  {isClassifying && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-card border shadow-lg rounded-lg px-4 py-2 flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm font-medium">Analyzing...</span>
                    </div>
                  )}
                  <Document
                    file={pdfFile}
                    onLoadSuccess={onDocumentLoadSuccess}
                    className="flex justify-center p-4"
                  >
                    <div className="relative inline-block" ref={pdfWrapperRef}>
                      <Page
                        pageNumber={pageNumber}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        scale={pdfScale}
                        className="shadow-lg"
                        onLoadSuccess={onPageLoadSuccess}
                      />
                      {/* Exact selection highlight overlay */}
                      {selectionRects.length > 0 && (
                        <div className="pointer-events-none absolute inset-0 z-30">
                          {selectionRects.map((r, i) => (
                            <div
                              key={`sel-${i}`}
                              className="absolute"
                              style={{
                                left: r.left,
                                top: r.top,
                                width: r.width,
                                height: r.height,
                                backgroundColor: "rgba(255, 255, 0, 0.18)",
                                outline: "1px solid rgba(255, 215, 0, 0.35)",
                                borderRadius: 2,
                              }}
                              title={lastSelectedText}
                            />
                          ))}
                        </div>
                      )}
                      {pageTextContent && pageViewport && currentData.length > 0 && (
                        <PdfHighlightLayer
                          citations={currentData}
                          pageNumber={pageNumber}
                          pageWidth={pageDimensions.width}
                          pageHeight={pageDimensions.height}
                          textContent={pageTextContent}
                          viewport={pageViewport}
                          hoveredCitation={hoveredCitation}
                          scale={pdfScale}
                        />
                      )}
                    </div>
                  </Document>
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Citation Data - Fixed Panel */}
            <ResizablePanel defaultSize={55} minSize={35}>
              <div className="h-full flex flex-col overflow-hidden bg-card">
                {/* Fixed Header */}
                <div className="px-3 py-2 border-b shrink-0">
                  <div className="flex justify-between items-center">
                    <h2 className="text-sm font-semibold">
                      Extracted Citations (Page {pageNumber})
                    </h2>
                    <div className="flex items-center gap-1.5">
                      {(isExtracting || isBatchProcessing) && (
                        <div className="flex items-center gap-1.5 text-xs text-primary mr-2">
                          <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          <span>{isBatchProcessing ? "Processing batch..." : "Extracting..."}</span>
                        </div>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={handleAddRawRow}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Add Raw Row</TooltipContent>
                      </Tooltip>
                      {currentData.length > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={handleClearAll}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Clear All</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Scrollable Table Container */}
                <div className="flex-1 overflow-auto p-3">
                  {currentData.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">Press Extract or select text to add citations</p>
                    </div>
                  ) : (
                    <CitationTable
                      data={currentData}
                      onDataChange={(newData) => {
                        setPageData(prev => ({
                          ...prev,
                          [pageNumber]: newData
                        }));
                      }}
                      onRowHover={setHoveredCitation}
                      selectedRowIndex={targetRowIndex}
                      onRowSelect={setTargetRowIndex}
                    />
                  )}
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Upload className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-1">No PDF Uploaded</h3>
              <p className="text-sm text-muted-foreground">
                Upload a legal document to start extracting citations
              </p>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

export default Index;