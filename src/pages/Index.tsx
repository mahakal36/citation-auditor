import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CitationTable } from "@/components/CitationTable";
import { PdfHighlightLayer } from "@/components/PdfHighlightLayer";
import { ChevronLeft, ChevronRight, Upload, Download, Sparkles } from "lucide-react";
import * as XLSX from "xlsx";
import type { CitationEntry } from "@/types/citation";
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
  const [pageInputValue, setPageInputValue] = useState("");
  const [isClassifying, setIsClassifying] = useState(false);
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
      // Load PDF and extract page text and image
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(pageNumber);
      
      // Extract text
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");

      // Render page as image
      const viewport = page.getViewport({ scale: 3 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      if (context) {
        await page.render({ canvasContext: context, viewport }).promise;
        const pageImage = canvas.toDataURL("image/jpeg", 0.95).split(",")[1];

        // Call backend for extraction
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-citations`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                pageText,
                pageImage,
                pageNumber,
                reportName: pdfFile.name,
                fewShotExamples: fewShotExamples.slice(-5), // Send last 5 corrected examples
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
      }
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
        
        const viewport = page.getViewport({ scale: 3 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        if (context) {
          await page.render({ canvasContext: context, viewport }).promise;
          const pageImage = canvas.toDataURL("image/jpeg", 0.95).split(",")[1];

           const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-citations`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pageText,
                pageImage,
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

  const handlePageJump = () => {
    const pageNum = parseInt(pageInputValue);
    if (pageNum >= 1 && pageNum <= numPages) {
      setPageNumber(pageNum);
      setPageInputValue("");
    } else {
      toast({
        title: "Invalid Page",
        description: `Please enter a page number between 1 and ${numPages}`,
        variant: "destructive",
      });
    }
  };

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
        // Create new citation entry
        const newEntry: CitationEntry = {
          "Non-Bates Exhibits": data.category === "Non-Bates Exhibits" ? data.value : "",
          "Depositions": data.category === "Depositions" ? data.value : "",
          "date": data.category === "date" ? data.value : "",
          "cites": data.category === "cites" ? data.value : "",
          "BatesBegin": data.category === "BatesBegin" ? data.value : "",
          "BatesEnd": data.category === "BatesEnd" ? data.value : "",
          "Pinpoint": data.category === "Pinpoint" ? data.value : "",
          "Code Lines": data.category === "Code Lines" ? data.value : "",
          "Report Name": data.category === "Report Name" ? data.value : pdfFile.name,
          "Paragraph No.": data.category === "Para. No." ? parseInt(data.value) || 0 : 0,
        };

        setPageData(prev => ({
          ...prev,
          [pageNumber]: [...(prev[pageNumber] || []), newEntry],
        }));

        toast({
          title: "Citation Added",
          description: `Added as ${data.category} with ${data.confidence} confidence`,
        });
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      <div className="container mx-auto p-6 max-w-[1800px]">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent mb-2">
            Legal Citation Auditor
          </h1>
          <p className="text-muted-foreground">
            AI-powered citation extraction and validation for legal documents
          </p>
        </div>

        {/* Controls */}
        <div className="bg-card rounded-lg border shadow-sm p-6 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="pdf-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors w-fit">
                  <Upload className="w-4 h-4" />
                  <span>Upload PDF</span>
                </div>
                <Input
                  id="pdf-upload"
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              {pdfFile && (
                <p className="text-sm text-muted-foreground mt-2">
                  {pdfFile.name}
                </p>
              )}
            </div>

            {pdfFile && (
              <>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                    disabled={pageNumber <= 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium min-w-[100px] text-center">
                    Page {pageNumber} of {numPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
                    disabled={pageNumber >= numPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Jump to page"
                    value={pageInputValue}
                    onChange={(e) => setPageInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handlePageJump()}
                    className="w-32"
                    min={1}
                    max={numPages}
                  />
                  <Button 
                    onClick={handlePageJump} 
                    disabled={!pageInputValue}
                    variant="secondary"
                  >
                    Go
                  </Button>
                </div>

                <Button
                  onClick={extractPageData}
                  disabled={isExtracting || isBatchProcessing}
                  className="gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {isExtracting ? "Extracting..." : "Extract Page"}
                </Button>

                <Button
                  onClick={extractBatchPages}
                  disabled={isExtracting || isBatchProcessing}
                  variant="outline"
                  className="gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {isBatchProcessing ? "Processing..." : "Extract 10 Pages"}
                </Button>

                <Button
                  onClick={handleSavePageData}
                  variant="secondary"
                  disabled={currentData.length === 0}
                >
                  Save Page Data
                </Button>

                <Button
                  onClick={handleDownloadCSV}
                  variant="outline"
                  disabled={allSavedData.length === 0}
                  className="gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download Excel ({allSavedData.length})
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Main Content */}
        {pdfFile && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-280px)]">
            {/* PDF Viewer */}
            <div className="bg-card rounded-lg border shadow-sm p-6 flex flex-col overflow-hidden">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Source Document</h2>
                <p className="text-xs text-muted-foreground">
                  {isClassifying ? "Classifying..." : "Select text to classify"}
                </p>
              </div>
              <div 
                className="border rounded-md overflow-auto bg-muted/20 relative flex-1"
                onMouseUp={handleTextSelection}
              >
                <Document
                  file={pdfFile}
                  onLoadSuccess={onDocumentLoadSuccess}
                  className="flex justify-center"
                >
                  <div className="relative inline-block">
                    <Page
                      pageNumber={pageNumber}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      className="max-w-full"
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
                      />
                    )}
                  </div>
                </Document>
              </div>
            </div>

            {/* Citation Data */}
            <div className="bg-card rounded-lg border shadow-sm p-6 flex flex-col overflow-hidden">
              <h2 className="text-xl font-semibold mb-4">
                Extracted Citations (Page {pageNumber})
              </h2>
              {currentData.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Press "Extract Page" or select text to add citations</p>
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
        )}


        {!pdfFile && (
          <div className="text-center py-20">
            <Upload className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">No PDF Uploaded</h3>
            <p className="text-muted-foreground">
              Upload a legal document to start extracting citations
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
