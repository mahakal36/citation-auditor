export type CitationEntry = {
  "Non-Bates Exhibits": string;
  Depositions: string;
  date: string;
  cites: string;
  BatesBegin: string;
  BatesEnd: string;
  Pinpoint: string;
  "Code Lines": string;
  "Report Name": string;
  "Paragraph No.": number;
};

export type ExtractionMemory = {
  last_paragraph_number_used: number | null;
  incomplete_exhibit_detected: boolean;
  raw_text: string;
  last_page_processed: number;
};

export type ExtractionResult = {
  citations: CitationEntry[];
  memory?: ExtractionMemory;
};
