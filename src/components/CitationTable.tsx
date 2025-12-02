import { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type ColumnDef,
} from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import type { CitationEntry } from "@/types/citation";

interface CitationTableProps {
  data: CitationEntry[];
  onDataChange: (data: CitationEntry[]) => void;
  onRowHover?: (rowIndex: number | null) => void;
  onCitationCorrected?: (citation: CitationEntry) => void;
}

const columnHelper = createColumnHelper<CitationEntry>();

export const CitationTable = ({ data, onDataChange, onRowHover, onCitationCorrected }: CitationTableProps) => {
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    columnId: string;
  } | null>(null);

  const handleCellEdit = (rowIndex: number, columnId: string, value: string) => {
    const newData = [...data];
    const key = columnId as keyof CitationEntry;
    
    if (key === "Paragraph No.") {
      newData[rowIndex][key] = parseInt(value) || 0;
    } else {
      newData[rowIndex][key] = value;
    }
    
    onDataChange(newData);
    
    // Track manual correction for few-shot learning
    if (onCitationCorrected) {
      onCitationCorrected(newData[rowIndex]);
    }
  };

  const renderEditableCell = (info: any, columnId: string) => {
    const isNumber = columnId === "Paragraph No.";
    return (
      <Input
        key={`${info.row.index}-${columnId}`}
        type={isNumber ? "number" : "text"}
        defaultValue={info.getValue() || (isNumber ? 0 : "")}
        onBlur={(e) => handleCellEdit(info.row.index, columnId, e.target.value)}
        className="h-6 text-[10px] px-1 py-0.5 w-full min-w-[60px]"
      />
    );
  };

  const handleAddRow = () => {
    const emptyRow: CitationEntry = {
      "Non-Bates Exhibits": "nan",
      Depositions: "nan",
      date: "nan",
      cites: "nan",
      BatesBegin: "nan",
      BatesEnd: "nan",
      Pinpoint: "nan",
      "Code Lines": "nan",
      "Report Name": data[0]?.["Report Name"] || "",
      "Paragraph No.": 0,
    };
    onDataChange([...data, emptyRow]);
  };

  const handleDeleteRow = (rowIndex: number) => {
    const newData = data.filter((_, index) => index !== rowIndex);
    onDataChange(newData);
  };

  const columns: ColumnDef<CitationEntry, any>[] = [
    columnHelper.accessor("Non-Bates Exhibits", {
      header: "Non-Bates Exhibits",
      cell: (info) => renderEditableCell(info, "Non-Bates Exhibits"),
    }),
    columnHelper.accessor("Depositions", {
      header: "Depositions",
      cell: (info) => renderEditableCell(info, "Depositions"),
    }),
    columnHelper.accessor("date", {
      header: "Date",
      cell: (info) => renderEditableCell(info, "date"),
    }),
    columnHelper.accessor("cites", {
      header: "Cites",
      cell: (info) => renderEditableCell(info, "cites"),
    }),
    columnHelper.accessor("BatesBegin", {
      header: "Bates Begin",
      cell: (info) => renderEditableCell(info, "BatesBegin"),
    }),
    columnHelper.accessor("BatesEnd", {
      header: "Bates End",
      cell: (info) => renderEditableCell(info, "BatesEnd"),
    }),
    columnHelper.accessor("Pinpoint", {
      header: "Pinpoint",
      cell: (info) => renderEditableCell(info, "Pinpoint"),
    }),
    columnHelper.accessor("Code Lines", {
      header: "Code Lines",
      cell: (info) => renderEditableCell(info, "Code Lines"),
    }),
    columnHelper.accessor("Report Name", {
      header: "Report Name",
      cell: (info) => renderEditableCell(info, "Report Name"),
    }),
    {
      id: "paragraphNo",
      accessorFn: (row) => row["Paragraph No."],
      header: "Para. No.",
      cell: (info) => renderEditableCell(info, "Paragraph No."),
    },
    columnHelper.display({
      id: "actions",
      header: "",
      cell: (info) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleDeleteRow(info.row.index)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      ),
    }),
  ];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="border rounded-md overflow-auto flex-1 max-h-[calc(100vh-400px)]">
        <table className="w-full border-collapse text-[10px]">
          <thead className="bg-muted sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="border p-1 text-left text-[10px] font-medium whitespace-nowrap"
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-muted/50 transition-colors"
                onMouseEnter={() => onRowHover?.(row.index)}
                onMouseLeave={() => onRowHover?.(null)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="border p-0.5">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <Button onClick={handleAddRow} variant="outline" size="sm" className="gap-2">
        <Plus className="w-4 h-4" />
        Add Row
      </Button>
      
      <p className="text-xs text-muted-foreground">
        Total: {data.length} citations
      </p>
    </div>
  );
};
