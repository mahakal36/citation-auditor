import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type ColumnDef,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { CitationEntry } from "@/types/citation";
import { useEffect, useRef, useState } from "react";

interface CitationTableProps {
  data: CitationEntry[];
  onDataChange: (data: CitationEntry[]) => void;
  onRowHover?: (rowIndex: number | null) => void;
  onCitationCorrected?: (citation: CitationEntry) => void;
  selectedRowIndex?: number | null;
  onRowSelect?: (rowIndex: number) => void;
}

const columnHelper = createColumnHelper<CitationEntry>();

export const CitationTable = ({
  data,
  onDataChange,
  onRowHover,
  onCitationCorrected,
  selectedRowIndex,
  onRowSelect,
}: CitationTableProps) => {

  const handleCellEdit = (rowIndex: number, columnId: string, value: string) => {
    const newData = [...data];
    const key = columnId as keyof CitationEntry;

    if (key === "Paragraph No.") {
      newData[rowIndex][key] = parseInt(value) || 0;
    } else {
      newData[rowIndex][key] = value;
    }

    onDataChange(newData);

    if (onCitationCorrected) {
      onCitationCorrected(newData[rowIndex]);
    }
  };

  const EditableCell = ({
    value,
    rowIndex,
    columnId,
  }: {
    value: any;
    rowIndex: number;
    columnId: string;
  }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [localValue, setLocalValue] = useState<string>(value ?? "");

    // Sync with external value when not focused
    useEffect(() => {
      const external = value === null || value === undefined ? "" : String(value);
      if (document.activeElement !== inputRef.current && localValue !== external) {
        setLocalValue(external);
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setLocalValue(newValue);
      handleCellEdit(rowIndex, columnId, newValue);
    };

    return (
      <div className="relative group">
        <input
          ref={inputRef}
          type="text"
          value={localValue}
          onChange={handleChange}
          spellCheck={false}
          className="w-full min-h-[24px] px-1.5 py-1 text-xs outline-none focus:bg-primary/5 rounded transition-colors pr-5 bg-transparent border-none cursor-text selection:bg-primary/20"
          style={{ caretColor: 'auto' }}
        />
        <button
          type="button"
          aria-label="Clear cell"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setLocalValue("");
            handleCellEdit(rowIndex, columnId, "");
            inputRef.current?.focus();
          }}
          className="absolute right-0.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[10px] leading-4 text-muted-foreground hover:text-foreground rounded hover:bg-muted/60 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Clear"
        >
          ×
        </button>
      </div>
    );
  };

  const renderEditableCell = (info: any, columnId: string) => {
    return (
      <EditableCell
        value={info.getValue()}
        rowIndex={info.row.index}
        columnId={columnId}
      />
    );
  };

  const handleDeleteRow = (rowIndex: number) => {
    const newData = data.filter((_, index) => index !== rowIndex);
    onDataChange(newData);
  };

  const columns: ColumnDef<CitationEntry, any>[] = [
    columnHelper.accessor("Non-Bates Exhibits", {
      header: "Non-Bates Exhibits",
      cell: (info) => renderEditableCell(info, "Non-Bates Exhibits"),
      size: 140,
    }),
    columnHelper.accessor("Depositions", {
      header: "Depositions",
      cell: (info) => renderEditableCell(info, "Depositions"),
      size: 100,
    }),
    columnHelper.accessor("date", {
      header: "Date",
      cell: (info) => renderEditableCell(info, "date"),
      size: 80,
    }),
    columnHelper.accessor("cites", {
      header: "Cites",
      cell: (info) => renderEditableCell(info, "cites"),
      size: 80,
    }),
    columnHelper.accessor("BatesBegin", {
      header: "Bates Begin",
      cell: (info) => renderEditableCell(info, "BatesBegin"),
      size: 100,
    }),
    columnHelper.accessor("BatesEnd", {
      header: "Bates End",
      cell: (info) => renderEditableCell(info, "BatesEnd"),
      size: 100,
    }),
    columnHelper.accessor("Pinpoint", {
      header: "Pinpoint",
      cell: (info) => renderEditableCell(info, "Pinpoint"),
      size: 80,
    }),
    columnHelper.accessor("Code Lines", {
      header: "Code Lines",
      cell: (info) => renderEditableCell(info, "Code Lines"),
      size: 80,
    }),
    columnHelper.accessor("Report Name", {
      header: "Report Name",
      cell: (info) => renderEditableCell(info, "Report Name"),
      size: 120,
    }),
    {
      id: "Paragraph No.",
      accessorFn: (row) => row["Paragraph No."],
      header: "Para.",
      cell: (info) => renderEditableCell(info, "Paragraph No."),
      size: 50,
    },
    columnHelper.display({
      id: "actions",
      header: "",
      size: 40,
      cell: (info) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleDeleteRow(info.row.index)}
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="w-3.5 h-3.5" />
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
    <div className="h-full flex flex-col">
      <div className="border rounded-md overflow-y-auto overflow-x-hidden flex-1">
        <table className="w-full border-collapse text-xs table-fixed">
          <thead className="bg-muted/80 sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="border-b border-r last:border-r-0 px-2 py-2 text-left text-xs font-medium text-muted-foreground"
                    style={{ width: header.column.getSize() }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={`hover:bg-muted/40 transition-colors ${selectedRowIndex === row.index ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}
                onMouseEnter={() => onRowHover?.(row.index)}
                onMouseLeave={() => onRowHover?.(null)}
                onClick={() => onRowSelect?.(row.index)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td 
                    key={cell.id} 
                    className="border-b border-r last:border-r-0 p-0 align-top"
                    style={{ width: cell.column.getSize() }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground mt-2 shrink-0">
        {data.length} citation{data.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
};