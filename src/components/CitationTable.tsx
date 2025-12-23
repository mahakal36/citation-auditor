import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type ColumnDef,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Trash2, Eraser } from "lucide-react";
import type { CitationEntry } from "@/types/citation";
import { useEffect, useRef, useState, useLayoutEffect } from "react";


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
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const [showColumnManager, setShowColumnManager] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [columnFilter, setColumnFilter] = useState("");

  // Close drawer on Escape
  useEffect(() => {
    if (!showColumnManager) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowColumnManager(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showColumnManager]);

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

const EditableCell = ({ value, rowIndex, columnId }: { value: any; rowIndex: number; columnId: string }) => {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [localValue, setLocalValue] = useState<string>(value ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const saveTimerRef = useRef<number | null>(null);

  // Keep local value in sync when parent updates (but not while actively editing)
  useEffect(() => {
    const external = value == null ? "" : String(value);
    if (!isEditing && external !== localValue) setLocalValue(external);
    //console.log(value, localValue);
  }, [value, isEditing]);

  const autoResize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 240) + "px";
    console.log(localValue);
  };

  useLayoutEffect(autoResize, [localValue]);


   

  return (
   
    <div className="relative group">
  <textarea
    ref={taRef}
    value={localValue}
    onChange={(e) => {
      const text = e.target.value;
      setLocalValue(text);
      autoResize();
    }}

    onFocus={() => setIsEditing(true)}

    onBlur={() => {
      handleCellEdit(rowIndex, columnId, localValue);
      setIsEditing(false);
    }}

    onMouseLeave={() => {
      if (isEditing) {
        handleCellEdit(rowIndex, columnId, localValue);
        setIsEditing(false);
      }
    }}

    onMouseDown={(e) => e.stopPropagation()}
    onClick={(e) => e.stopPropagation()}
    spellCheck={false}
    rows={1}
    className="w-full min-h-[24px] px-1.5 py-1 text-xs outline-none focus:bg-primary/5 rounded transition-colors pr-5 cursor-text whitespace-pre-wrap break-words resize-none bg-transparent"
    style={{ maxHeight: 240, overflowY: "auto" }}
  />

  <button
    type="button"
    aria-label="Clear cell"
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      setLocalValue("");
      handleCellEdit(rowIndex, columnId, "");
      autoResize();
    }}
    className="absolute right-0.5 top-0.5 h-4 w-4 text-[10px] leading-4 text-muted-foreground hover:text-foreground rounded hover:bg-muted/60 opacity-0 group-hover:opacity-100 transition-opacity"
    title="Clear"
  >
    ×
  </button>
</div>

  );
};



  const renderEditableCell = (info: any, columnId: string) => {
    //console.log("Rendering cell", info.row.index, columnId, info.getValue());
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

  const handleClearRow = (rowIndex: number) => {
    const newData = [...data];
    const row = { ...newData[rowIndex] } as CitationEntry;
    Object.keys(row).forEach((k) => {
      if (k === "Paragraph No.") {
        (row as any)[k] = 0;
      } else if (k !== "Report Name") {
        (row as any)[k] = "";
      }
    });
    newData[rowIndex] = row;
    onDataChange(newData);
  };

  const handleClearColumn = (columnId: keyof CitationEntry) => {
    const newData = data.map((row) => {
      const copy = { ...row } as CitationEntry;
      if (columnId === "Paragraph No.") {
        (copy as any)[columnId] = 0;
      } else if (columnId !== "Report Name") {
        (copy as any)[columnId] = "";
      }
      return copy;
    });
    onDataChange(newData);
  };

  const headerWithClear = (label: string, key: keyof CitationEntry) => (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <button
        type="button"
        className="text-[10px] text-muted-foreground hover:text-foreground px-1 py-0.5 border rounded"
        onClick={(e) => { e.stopPropagation(); handleClearColumn(key); }}
        title={`Clear ${label}`}
      >
        CLR
      </button>
    </div>
  );

  const columns: ColumnDef<CitationEntry, any>[] = [
  columnHelper.accessor("Non-Bates Exhibits", {
    header: () => headerWithClear("Non-Bates Exhibits", "Non-Bates Exhibits"),
    cell: (info) => renderEditableCell(info, "Non-Bates Exhibits"),
    size: 140,
  }),

  columnHelper.accessor("Depositions", {
    header: () => headerWithClear("Depositions", "Depositions"),
    cell: (info) => renderEditableCell(info, "Depositions"),
    size: 100,
  }),

  columnHelper.accessor("date", {
    header: () => headerWithClear("Date", "date"),
    cell: (info) => renderEditableCell(info, "date"),
    size: 80,
  }),

  columnHelper.accessor("cites", {
    header: () => headerWithClear("Cites", "cites"),
    cell: (info) => renderEditableCell(info, "cites"),
    size: 80,
  }),

  columnHelper.accessor("BatesBegin", {
    header: () => headerWithClear("Bates Begin", "BatesBegin"),
    cell: (info) => renderEditableCell(info, "BatesBegin"),
    size: 100,
  }),

  columnHelper.accessor("BatesEnd", {
    header: () => headerWithClear("Bates End", "BatesEnd"),
    cell: (info) => renderEditableCell(info, "BatesEnd"),
    size: 100,
  }),

  columnHelper.accessor("Pinpoint", {
    header: () => headerWithClear("Pinpoint", "Pinpoint"),
    cell: (info) => renderEditableCell(info, "Pinpoint"),
    size: 80,
  }),

  columnHelper.accessor("Code Lines", {
    header: () => headerWithClear("Code Lines", "Code Lines"),
    cell: (info) => renderEditableCell(info, "Code Lines"),
    size: 80,
  }),

  columnHelper.accessor("Report Name", {
    header: () => headerWithClear("Report Name", "Report Name"),
    cell: (info) => renderEditableCell(info, "Report Name"),
    size: 120,
  }),

  // FIXED ❗ Replaced accessorFn with stable accessor
  columnHelper.accessor("Paragraph No.", {
    header: () => headerWithClear("Para.", "Paragraph No."),
    cell: (info) => renderEditableCell(info, "Paragraph No."),
    size: 50,
  }),

  columnHelper.display({
    id: "actions",
    header: "",
    size: 40,
    cell: (info) => (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleClearRow(info.row.index)}
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          title="Clear Row"
        >
          <Eraser className="w-3.5 h-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleDeleteRow(info.row.index)}
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          title="Delete Row"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    ),
  }),
];


  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
  });

  // Ensure consistent scrolling behavior inside the table container
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // allow browser zoom
      // If this container can scroll, take control of the wheel to avoid parent interference
      const canScrollY = el.scrollHeight > el.clientHeight;
      const canScrollX = el.scrollWidth > el.clientWidth;
      if (!canScrollY && !canScrollX) return; // nothing to do
      e.preventDefault();
      // Natural behavior: positive deltaY scrolls down
      el.scrollTop += e.deltaY;
      // Horizontal scroll support (shift or native horizontal delta)
      if (e.shiftKey && e.deltaX === 0) {
        el.scrollLeft += e.deltaY;
      } else if (e.deltaX !== 0) {
        el.scrollLeft += e.deltaX;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className="h-full flex flex-col min-h-0"> {/* ADDED: min-h-0 to allow flex child (table container) to shrink properly in flex contexts */}
      {/* Column Manager Toolbar (opens side drawer) */}
      <div className="mb-2 flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowColumnManager(true)}>
          Columns
        </Button>
      </div>

      {/* Side Drawer for Column Manager */}
      {showColumnManager && (
        <div className="fixed inset-0 z-50" aria-modal="true" role="dialog">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowColumnManager(false)}
          />
          {/* Panel */}
          <div
            className="absolute right-0 top-0 h-full w-full sm:w-[420px] md:w-[560px] lg:w-[680px] bg-card border-l shadow-xl flex flex-col transition-transform duration-200 translate-x-0"
          >
            <div className="p-3 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold">Manage Columns</h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const vis: Record<string, boolean> = {};
                    table.getAllLeafColumns().forEach((c) => { vis[c.id] = false; });
                    setColumnVisibility(vis);
                  }}
                >
                  Hide All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const vis: Record<string, boolean> = {};
                    table.getAllLeafColumns().forEach((c) => { vis[c.id] = true; });
                    setColumnVisibility(vis);
                  }}
                >
                  Show All
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowColumnManager(false)}>Close</Button>
              </div>
            </div>
            <div className="p-3 overflow-auto flex-1">
              <div className="mb-2">
                <input
                  type="text"
                  value={columnFilter}
                  onChange={(e) => setColumnFilter(e.target.value)}
                  placeholder="Search columns..."
                  className="w-full border rounded px-2 py-1 text-sm bg-background"
                />
              </div>
              <div className="space-y-2">
                {table
                  .getAllLeafColumns()
                  .filter((c) => c.id.toLowerCase().includes(columnFilter.toLowerCase()))
                  .map((col) => (
                  <div key={col.id} className="flex items-center justify-between gap-2 border rounded px-2 py-1">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={col.getIsVisible()}
                        onChange={() => col.toggleVisibility()}
                      />
                      <span className="truncate max-w-[190px]" title={col.id}>{col.id}</span>
                    </label>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => handleClearColumn(col.id as keyof CitationEntry)}
                        title={`Clear ${col.id}`}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <div ref={scrollRef} className="border rounded-md overflow-auto flex-1 min-h-0 overscroll-contain">
        <table className="w-full border-collapse text-xs table-auto min-w-max">
          <thead className="bg-muted/80 sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: `${header.getSize()}px` }}
                    className="border-b border-r last:border-r-0 px-2 py-2 text-left text-xs font-medium text-muted-foreground"
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
                // onMouseEnter={() => onRowHover?.(row.index)}
                // onMouseLeave={() => onRowHover?.(null)}
                onClick={() => onRowSelect?.(row.index)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td 
                    key={cell.id} 
                    style={{ width: `${cell.column.getSize()}px` }}
                    className="border-b border-r last:border-r-0 p-0 align-top"
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