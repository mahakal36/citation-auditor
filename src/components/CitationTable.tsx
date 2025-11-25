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
}

const columnHelper = createColumnHelper<CitationEntry>();

export const CitationTable = ({ data, onDataChange }: CitationTableProps) => {
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
  };

  const handleAddRow = () => {
    const emptyRow: CitationEntry = {
      Exhibits: "nan",
      deponent: "nan",
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
    columnHelper.accessor("Exhibits", {
      header: "Exhibits",
      cell: (info) => (
        <Input
          value={info.getValue() || ""}
          onChange={(e) =>
            handleCellEdit(info.row.index, "Exhibits", e.target.value)
          }
          className="min-w-[200px]"
        />
      ),
    }),
    columnHelper.accessor("deponent", {
      header: "Deponent",
      cell: (info) => (
        <Input
          value={info.getValue() || ""}
          onChange={(e) =>
            handleCellEdit(info.row.index, "deponent", e.target.value)
          }
          className="min-w-[150px]"
        />
      ),
    }),
    columnHelper.accessor("date", {
      header: "Date",
      cell: (info) => (
        <Input
          value={info.getValue() || ""}
          onChange={(e) =>
            handleCellEdit(info.row.index, "date", e.target.value)
          }
          className="min-w-[120px]"
        />
      ),
    }),
    columnHelper.accessor("cites", {
      header: "Cites",
      cell: (info) => (
        <Input
          value={info.getValue() || ""}
          onChange={(e) =>
            handleCellEdit(info.row.index, "cites", e.target.value)
          }
          className="min-w-[120px]"
        />
      ),
    }),
    columnHelper.accessor("BatesBegin", {
      header: "Bates Begin",
      cell: (info) => (
        <Input
          value={info.getValue() || ""}
          onChange={(e) =>
            handleCellEdit(info.row.index, "BatesBegin", e.target.value)
          }
          className="min-w-[150px]"
        />
      ),
    }),
    columnHelper.accessor("BatesEnd", {
      header: "Bates End",
      cell: (info) => (
        <Input
          value={info.getValue() || ""}
          onChange={(e) =>
            handleCellEdit(info.row.index, "BatesEnd", e.target.value)
          }
          className="min-w-[150px]"
        />
      ),
    }),
    columnHelper.accessor("Pinpoint", {
      header: "Pinpoint",
      cell: (info) => (
        <Input
          value={info.getValue() || ""}
          onChange={(e) =>
            handleCellEdit(info.row.index, "Pinpoint", e.target.value)
          }
          className="min-w-[120px]"
        />
      ),
    }),
    columnHelper.accessor("Code Lines", {
      header: "Code Lines",
      cell: (info) => (
        <Input
          value={info.getValue() || ""}
          onChange={(e) =>
            handleCellEdit(info.row.index, "Code Lines", e.target.value)
          }
          className="min-w-[120px]"
        />
      ),
    }),
    columnHelper.accessor("Report Name", {
      header: "Report Name",
      cell: (info) => (
        <Input
          value={info.getValue() || ""}
          onChange={(e) =>
            handleCellEdit(info.row.index, "Report Name", e.target.value)
          }
          className="min-w-[200px]"
        />
      ),
    }),
    {
      id: "paragraphNo",
      accessorFn: (row) => row["Paragraph No."],
      header: "Para. No.",
      cell: (info) => (
        <Input
          type="number"
          value={info.getValue() || 0}
          onChange={(e) =>
            handleCellEdit(info.row.index, "Paragraph No.", e.target.value)
          }
          className="min-w-[100px]"
        />
      ),
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
    <div className="space-y-4">
      <div className="border rounded-md overflow-auto max-h-[600px]">
        <table className="w-full border-collapse">
          <thead className="bg-muted sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="border p-2 text-left text-sm font-medium"
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
              <tr key={row.id} className="hover:bg-muted/50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="border p-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <Button onClick={handleAddRow} variant="outline" className="gap-2">
        <Plus className="w-4 h-4" />
        Add Row
      </Button>
      
      <p className="text-sm text-muted-foreground">
        Total: {data.length} citations
      </p>
    </div>
  );
};
