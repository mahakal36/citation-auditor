import { useState, useCallback } from "react";
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
  const [fewShotExamples, setFewShotExamples] = useState<CitationEntry[]>([]);
  const [isClassifying, setIsClassifying] = useState(false);
  const [pdfScale, setPdfScale] = useState(1.0);
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
            fewShotExamples: fewShotExamples.slice(-5),
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
  }, [pdfFile, pageNumber, fewShotExamples, toast]);

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
              fewShotExamples: fewShotExamples.slice(-5),
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
  }, [pdfFile, pageNumber, numPages, fewShotExamples, toast]);

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

  const handleTextSelection = useCallback(async () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    
    if (!selectedText || selectedText.length < 2 || !pdfFile) {
      return;
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
      
      if (data.category !== "Uncategorized") {
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

        if (data.category === "Bates Range" && data.batesBegin && data.batesEnd) {
          newEntry.BatesBegin = data.batesBegin;
          newEntry.BatesEnd = data.batesEnd;
          
          setPageData(prev => ({
            ...prev,
            [pageNumber]: [...(prev[pageNumber] || []), newEntry],
          }));

          toast({
            title: "Bates Range Added",
            description: `Begin: ${data.batesBegin}, End: ${data.batesEnd}`,
          });
        } else {
          const fieldMap: Record<string, keyof CitationEntry> = {
            "Non-Bates Exhibits": "Non-Bates Exhibits",
            "Depositions": "Depositions",
            "Date": "date",
            "Cites": "cites",
            "Bates Begin": "BatesBegin",
            "Bates End": "BatesEnd",
            "Pinpoint": "Pinpoint",
            "Code Lines": "Code Lines",
            "Report Name": "Report Name",
            "Para. No.": "Paragraph No.",
          };

          const field = fieldMap[data.category];
          if (field) {
            if (field === "Paragraph No.") {
              newEntry[field] = parseInt(data.value) || 0;
            } else {
              newEntry[field] = data.value;
            }
          }

          setPageData(prev => ({
            ...prev,
            [pageNumber]: [...(prev[pageNumber] || []), newEntry],
          }));

          toast({
            title: "Citation Added",
            description: `Added as ${data.category}`,
          });
        }
      } else {
        toast({
          title: "Not a Citation",
          description: "Selected text doesn't match any citation category",
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
    setPageData(prev => ({
      ...prev,
      [pageNumber]: [...(prev[pageNumber] || []), emptyRow],
    }));
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
                    <div className="relative inline-block">
                      <Page
                        pageNumber={pageNumber}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        scale={pdfScale}
                        className="shadow-lg"
                        onLoadSuccess={onPageLoadSuccess}
                      />
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
                      onCitationCorrected={(citation) => {
                        setFewShotExamples(prev => {
                          const exists = prev.some(ex => JSON.stringify(ex) === JSON.stringify(citation));
                          if (!exists) {
                            toast({
                              title: "Learning Example Added",
                              description: "This correction will improve future extractions",
                            });
                            return [...prev, citation].slice(-10);
                          }
                          return prev;
                        });
                      }}
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