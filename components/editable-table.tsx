"use client";











import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";







import { Button } from "@/components/ui/button";



import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Copy, Pencil, Plus, Printer, Search, Trash2 } from "lucide-react";



import { Input } from "@/components/ui/input";



import { Select } from "@/components/ui/select";



import type { Product, ProductKit } from "@/lib/types";



import { formatCurrency } from "@/lib/utils";

import { toast } from "sonner";







type ProductInsight = {



  weekly: number;



  monthly: number;



  ideal: number;



};

type ColumnKey =
  | "select"
  | "kits"
  | "name"
  | "sku"
  | "unitPrice"
  | "category"
  | "supplier"
  | "quantity"
  | "estoqueMinimo"
  | "totalValue";

const COLUMN_MIN_WIDTHS: Record<ColumnKey, number> = {
  select: 48,
  kits: 56,
  name: 220,
  sku: 110,
  unitPrice: 130,
  category: 140,
  supplier: 150,
  quantity: 120,
  estoqueMinimo: 130,
  totalValue: 150
};

const INITIAL_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  select: 48,
  kits: 56,
  name: 280,
  sku: 140,
  unitPrice: 150,
  category: 160,
  supplier: 170,
  quantity: 140,
  estoqueMinimo: 160,
  totalValue: 170
};

const NON_RESIZABLE_COLUMNS = new Set<ColumnKey>(["select", "kits"]);







interface EditableTableProps {



  products: Product[];



  categories: string[];



  suppliers: string[];



  salesInsights: Record<string, ProductInsight>;



  onChange: (id: string, changes: Partial<Product>) => Promise<void>;



  onDelete: (ids: string[]) => Promise<void>;



  onCreate: () => void;



  onGenerateLabels: (products: Product[], quantity: number) => void;



  onExport: () => void;



  onImport: (file: File) => Promise<void>;



  onSeed: () => void;



  onManageCategories: () => void;



  onManageSuppliers: () => void;



  // KIT-SKU START

  enableKits?: boolean;

  expandedProductIds?: string[];

  onToggleExpand?: (id: string) => void;

  onCreateKit?: (product: Product) => void;

  onEditKit?: (product: Product, kit: ProductKit) => void;

  onDeleteKit?: (product: Product, kit: ProductKit) => Promise<void>;

  onGenerateKitLabel?: (product: Product, kit: ProductKit) => void;

  // KIT-SKU END

}







type SortKey = "name" | "sku" | "unitPrice" | "category" | "supplier" | "quantity" | "estoqueMinimo" | "totalValue";
type StockStatusKey = "sem-minimo" | "confortavel" | "saudavel" | "baixo" | "critico";
type StockStatusFilter = "all" | StockStatusKey;
type StockBadge = {
  label: string;
  className: string;
  ratio: number | null;
  status: StockStatusKey;
};







export function EditableTable({



  products,



  categories,



  suppliers,



  salesInsights,



  onChange,



  onDelete,



  onCreate,



  onGenerateLabels,



  onExport,



  onImport,



  onSeed,



  onManageCategories,



  onManageSuppliers,



  enableKits = false,



  expandedProductIds = [],



  onToggleExpand,



  onCreateKit,



  onEditKit,



  onDeleteKit,



  onGenerateKitLabel



}: EditableTableProps) {



  const [selected, setSelected] = useState<string[]>([]);



  const [drafts, setDrafts] = useState<Record<string, Partial<Product>>>({});



  const [saving, setSaving] = useState<string | null>(null);



  const [searchTerm, setSearchTerm] = useState("");
  const [stockStatusFilter, setStockStatusFilter] = useState<StockStatusFilter>("all");



  const [sortState, setSortState] = useState<{ key: SortKey; order: "asc" | "desc" }>({ key: "name", order: "asc" });



  const fileInputRef = useRef<HTMLInputElement>(null);



  const ensureInsight = (id: string): ProductInsight => salesInsights[id] ?? { weekly: 0, monthly: 0, ideal: 0 };







  const formatInsightTooltip = (insight: ProductInsight): string => {



    const { ideal, weekly, monthly } = insight;



    if (ideal <= 0 && weekly <= 0 && monthly <= 0) {



      return "Ideal em analise - sem vendas registradas na semana ou mes.";



    }



    const parts = [`Ideal ${ideal.toLocaleString("pt-BR")} unidade${ideal === 1 ? "" : "s"}`];



    parts.push(`vendas por semana ${weekly.toLocaleString("pt-BR")}`);



    parts.push(`vendas por mes ${monthly.toLocaleString("pt-BR")}`);



    return parts.join(" - ");



  };







  const stockBadgeFor = (quantity: number, minimo: number): StockBadge => {
    if (!Number.isFinite(minimo) || minimo <= 0) {
      return {
        label: "Sem minimo definido",
        className: "bg-slate-100 text-slate-600",
        ratio: null,
        status: "sem-minimo"
      };
    }
    const ratio = minimo > 0 ? quantity / minimo : Infinity;
    if (ratio >= 1.6) {
      return { label: "Confortavel", className: "bg-emerald-100 text-emerald-700", ratio, status: "confortavel" };
    }
    if (ratio >= 1.2) {
      return { label: "Saudavel", className: "bg-lime-100 text-lime-700", ratio, status: "saudavel" };
    }
    if (ratio >= 0.7) {
      return { label: "Baixo", className: "bg-orange-100 text-orange-700", ratio, status: "baixo" };
    }
    return { label: "Critico", className: "bg-red-100 text-red-700", ratio, status: "critico" };
  };




  // KIT-SKU START

  const kitsEnabled = Boolean(enableKits);

  const totalColumns = kitsEnabled ? 10 : 9;

  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(() => ({ ...INITIAL_COLUMN_WIDTHS }));

  const columnOrder = useMemo<ColumnKey[]>(() => {
    const order: ColumnKey[] = ["select"];
    if (kitsEnabled) {
      order.push("kits");
    }
    order.push("name", "sku", "unitPrice", "category", "supplier", "quantity", "estoqueMinimo", "totalValue");
    return order;
  }, [kitsEnabled]);

  const getColumnStyle = useCallback(
    (key: ColumnKey): CSSProperties => ({
      width: `${columnWidths[key]}px`,
      minWidth: `${COLUMN_MIN_WIDTHS[key]}px`
    }),
    [columnWidths]
  );

  const headerButtonClass =
    "flex items-center gap-1 text-slate-100 transition-colors hover:text-sky-200 focus:outline-none";
  const headerButtonRightClass =
    "flex w-full items-center justify-end gap-1 text-slate-100 transition-colors hover:text-sky-200 focus:outline-none";

  const resizingColumnRef = useRef<ColumnKey | null>(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);
  const originalUserSelectRef = useRef<string | null>(null);
  const originalCursorRef = useRef<string | null>(null);

  const handleResizeMove = useCallback((event: PointerEvent) => {
    const columnKey = resizingColumnRef.current;
    if (!columnKey) {
      return;
    }
    const delta = event.clientX - resizeStartXRef.current;
    const baseWidth = resizeStartWidthRef.current;
    const nextWidth = Math.max(COLUMN_MIN_WIDTHS[columnKey], baseWidth + delta);
    setColumnWidths((prev) => {
      const previousWidth = prev[columnKey];
      if (Math.abs(previousWidth - nextWidth) < 0.5) {
        return prev;
      }
      return { ...prev, [columnKey]: nextWidth };
    });
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizingColumnRef.current = null;
    if (originalUserSelectRef.current !== null) {
      document.body.style.userSelect = originalUserSelectRef.current;
      originalUserSelectRef.current = null;
    } else {
      document.body.style.removeProperty("user-select");
    }

    if (originalCursorRef.current !== null) {
      document.body.style.cursor = originalCursorRef.current;
      originalCursorRef.current = null;
    } else {
      document.body.style.removeProperty("cursor");
    }

    document.removeEventListener("pointermove", handleResizeMove);
    document.removeEventListener("pointerup", handleResizeEnd);
  }, [handleResizeMove]);

  const handleResizeStart = useCallback(
    (key: ColumnKey, event: ReactPointerEvent<HTMLSpanElement>) => {
      if (NON_RESIZABLE_COLUMNS.has(key)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      resizingColumnRef.current = key;
      resizeStartXRef.current = event.clientX;
      resizeStartWidthRef.current = columnWidths[key];
      originalUserSelectRef.current = document.body.style.userSelect;
      originalCursorRef.current = document.body.style.cursor;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      document.addEventListener("pointermove", handleResizeMove);
      document.addEventListener("pointerup", handleResizeEnd);
    },
    [columnWidths, handleResizeEnd, handleResizeMove]
  );

  useEffect(() => {
    return () => {
      handleResizeEnd();
    };
  }, [handleResizeEnd]);

  const expandedSet = useMemo(() => new Set(expandedProductIds), [expandedProductIds, kitsEnabled]);



  const handleToggleExpand = useCallback(

    (productId: string) => {

      if (onToggleExpand) {

        onToggleExpand(productId);

      }

    },

    [onToggleExpand]

  );



  const handleCopyKitSku = useCallback(async (sku: string) => {

    try {

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {

        await navigator.clipboard.writeText(sku);

      } else if (typeof window !== "undefined") {

        const input = window.document.createElement("input");

        input.value = sku;

        window.document.body.appendChild(input);

        input.select();

        window.document.execCommand("copy");

        window.document.body.removeChild(input);

      }

      toast.success("SKU copiado.");

    } catch (error) {

      console.error("Falha ao copiar SKU do kit", error);

      toast.error("N?o foi poss?vel copiar o SKU.");

    }

  }, []);



  const handleDeleteKit = useCallback(

    async (product: Product, kit: ProductKit) => {

      if (!onDeleteKit) {

        return;

      }

      const kitName = kit.label && kit.label.trim().length ? kit.label : kit.sku;

      if (typeof window !== "undefined") {

        const confirmed = window.confirm(`Remover o kit ${kitName}?`);

        if (!confirmed) {

          return;

        }

      }

      try {

        await onDeleteKit(product, kit);

        toast.success("Kit removido.");

      } catch (error) {

        console.error("Falha ao remover kit", error);

        toast.error("N?o foi poss?vel remover o kit.");

      }

    },

    [onDeleteKit]

  );

  // KIT-SKU END















  const toggleSelection = (id: string) => {



    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));



  };







  const handleDraftChange = (id: string, field: keyof Product, value: string | number) => {



    setDrafts((prev) => ({



      ...prev,



      [id]: {



        ...prev[id],



        [field]: value



      }



    }));



  };







  const commitChanges = async (id: string) => {



    const draft = drafts[id];



    if (!draft) return;



    setSaving(id);



    await onChange(id, draft);



    setDrafts((prev) => {



      const { [id]: _, ...rest } = prev;



      return rest;



    });



    setSaving(null);



  };







  const handleSort = (key: SortKey) => {



    setSortState((prev) => {



      if (prev.key === key) {



        return { key, order: prev.order === "asc" ? "desc" : "asc" };



      }



      return { key, order: "asc" };



    });



  };







  const renderSortIcon = (key: SortKey) => {



    if (sortState.key !== key) {



      return <ArrowUpDown className="h-3 w-3" aria-hidden="true" />;



    }







    return sortState.order === "asc" ? (



      <ArrowUp className="h-3 w-3" aria-hidden="true" />



    ) : (



      <ArrowDown className="h-3 w-3" aria-hidden="true" />



    );



  };







  const ariaSortFor = (key: SortKey): "ascending" | "descending" | "none" =>



    sortState.key === key ? (sortState.order === "asc" ? "ascending" : "descending") : "none";







  const filteredProducts = useMemo(() => {
    const trimmedTerm = searchTerm.trim();
    const normalizedTerm = trimmedTerm
      ? trimmedTerm.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      : "";

    const matches = (value: unknown) => {
      if (!trimmedTerm) return false;
      if (value === null || value === undefined) return false;
      return value
        .toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(normalizedTerm);
    };

    return products.filter((product) => {
      const merged = { ...product, ...drafts[product.id] };

      const hasSearchMatch =
        !trimmedTerm ||
        matches(merged.name) ||
        matches(merged.sku) ||
        matches(merged.category) ||
        matches(merged.supplier);

      if (!hasSearchMatch) {
        return false;
      }

      if (stockStatusFilter === "all") {
        return true;
      }

      const quantityValue =
        typeof merged.quantity === "number" ? merged.quantity : Number(merged.quantity ?? 0);

      const rawMinimo = (merged as Product & { estoqueMinimo?: number }).estoqueMinimo;
      const parsedMinimo = typeof rawMinimo === "number" ? rawMinimo : Number(rawMinimo ?? 0);
      const normalizedMinimo = Number.isFinite(parsedMinimo) ? Math.max(0, parsedMinimo) : 0;
      const badge = stockBadgeFor(quantityValue, normalizedMinimo);

      return badge.status === stockStatusFilter;
    });
  }, [products, drafts, searchTerm, stockStatusFilter]);








  const sortedProducts = useMemo(() => {



    const { key, order } = sortState;



    const direction = order === "asc" ? 1 : -1;







    const valueFor = (product: Product) => {



      const merged = { ...product, ...drafts[product.id] } as Product & Partial<Product>;







      switch (key) {



        case "unitPrice":



          return typeof merged.unitPrice === "number" ? merged.unitPrice : Number(merged.unitPrice ?? 0);



        case "quantity":



          return typeof merged.quantity === "number" ? merged.quantity : Number(merged.quantity ?? 0);



        case "estoqueMinimo":



          return typeof merged.estoqueMinimo === "number" ? merged.estoqueMinimo : Number(merged.estoqueMinimo ?? 0);



        case "totalValue":



          return typeof merged.totalValue === "number" ? merged.totalValue : Number(merged.totalValue ?? 0);



        case "sku":



          return (merged.sku ?? "").toString();



        case "category":



          return (merged.category ?? "").toString();



        case "supplier":



          return (merged.supplier ?? "").toString();



        case "name":



        default:



          return (merged.name ?? "").toString();



      }



    };







    return [...filteredProducts].sort((a, b) => {



      const aValue = valueFor(a);



      const bValue = valueFor(b);







      if (typeof aValue === "number" && typeof bValue === "number") {



        return (aValue - bValue) * direction;



      }







      return aValue.toString().localeCompare(bValue.toString(), "pt-BR", { sensitivity: "base" }) * direction;



    });



  }, [filteredProducts, drafts, sortState]);







  const visibleIds = useMemo(() => sortedProducts.map((product) => product.id), [sortedProducts]);



  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));



  const someVisibleSelected = visibleIds.some((id) => selected.includes(id));







  const handleToggleAllVisible = (checked: boolean) => {



    setSelected((prev) => {



      if (checked) {



        const merged = new Set(prev);



        visibleIds.forEach((id) => merged.add(id));



        return Array.from(merged);



      }



      if (!prev.length) return prev;



      const toRemove = new Set(visibleIds);



      return prev.filter((id) => !toRemove.has(id));



    });



  };







  const selectedProducts = products.filter((product) => selected.includes(product.id));







  const handleImportClick = () => {



    fileInputRef.current?.click();



  };







  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {



    const file = event.target.files?.[0];



    if (file) {



      await onImport(file);



    }



    event.target.value = "";



  };







  const handleGenerateLabels = () => {



    if (!selectedProducts.length) return;



    const quantity = Number(window.prompt("Quantas etiquetas gerar por item?", "1")) || 1;



    if (quantity <= 0) return;



    onGenerateLabels(selectedProducts, quantity);



  };







  return (



    <div className="space-y-4">



      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">



        <div className="flex flex-wrap items-center gap-3">



          <Button onClick={onCreate}>Novo produto</Button>



          <Button



            variant="outline"



            onClick={() => onDelete(selected)}



            disabled={!selected.length}



          >



            Excluir selecionados



          </Button>



          <Button variant="outline" onClick={handleGenerateLabels} disabled={!selected.length}>



            Gerar etiquetas



          </Button>



          <Button variant="outline" onClick={onExport}>



            Exportar JSON



          </Button>



          <Button variant="outline" onClick={handleImportClick}>



            Importar JSON



          </Button>



          <Button variant="outline" onClick={onManageCategories}>



            Categorias



          </Button>



          <Button variant="outline" onClick={onManageSuppliers}>



            Fornecedores



          </Button>



          <Button variant="ghost" onClick={onSeed}>



            Criar dados de exemplo



          </Button>



          <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleFileChange} />



        </div>



        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end xl:ml-auto xl:max-w-none">



          <Select



            value={stockStatusFilter}



            onChange={(event) => setStockStatusFilter(event.target.value as StockStatusFilter)}



            aria-label="Filtrar por status do estoque"



            className="sm:w-[200px]"



          >



            <option value="all">Todos os status</option>



            <option value="confortavel">Confortavel</option>



            <option value="saudavel">Saudavel</option>



            <option value="baixo">Baixo</option>



            <option value="critico">Critico</option>



            <option value="sem-minimo">Sem minimo definido</option>



          </Select>



          <div className="relative sm:w-[240px] md:w-[280px] lg:w-[320px]">



            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />



            <Input



              type="search"



              value={searchTerm}



              onChange={(event) => setSearchTerm(event.target.value)}



              placeholder="Buscar por nome, SKU, fornecedor ou categoria"



              className="pl-9"



              aria-label="Pesquisar produtos"



              autoComplete="off"



              spellCheck={false}



            />



          </div>



        </div>



      </div>







      <div className="overflow-x-auto rounded-xl border border-slate-200">



        <table className="w-full min-w-[1000px] table-fixed divide-y divide-slate-200">



          <colgroup>
            {columnOrder.map((key) => (
              <col key={key} style={getColumnStyle(key)} />
            ))}
          </colgroup>



          <thead className="sticky top-0 z-10 bg-slate-900 text-left text-xs font-semibold uppercase tracking-wide text-slate-100">
            <tr>
              <th className="py-3 pl-3 pr-3 text-slate-100" style={getColumnStyle("select")}>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => handleToggleAllVisible(event.target.checked)}
                  aria-checked={someVisibleSelected && !allVisibleSelected ? "mixed" : allVisibleSelected}
                  title="Selecionar resultados visiveis"
                />
              </th>
              {kitsEnabled ? (
                <th className="py-3 pl-2 pr-4 text-center text-slate-200" style={getColumnStyle("kits")}>
                  Kits
                </th>
              ) : null}
              <th
                className="group relative py-3 pl-3 pr-6"
                aria-sort={ariaSortFor("name")}
                style={getColumnStyle("name")}
              >
                <button
                  type="button"
                  onClick={() => handleSort("name")}
                  className={headerButtonClass}
                >
                  Nome
                  {renderSortIcon("name")}
                </button>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  className="absolute top-0 right-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center"
                  onPointerDown={(event) => handleResizeStart("name", event)}
                >
                  <span className="pointer-events-none h-8 w-[3px] rounded-full bg-white/40 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                </span>
              </th>
              <th
                className="group relative py-3 pl-3 pr-6"
                aria-sort={ariaSortFor("sku")}
                style={getColumnStyle("sku")}
              >
                <button
                  type="button"
                  onClick={() => handleSort("sku")}
                  className={headerButtonClass}
                >
                  SKU
                  {renderSortIcon("sku")}
                </button>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  className="absolute top-0 right-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center"
                  onPointerDown={(event) => handleResizeStart("sku", event)}
                >
                  <span className="pointer-events-none h-8 w-[3px] rounded-full bg-white/40 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                </span>
              </th>
              <th
                className="group relative py-3 pl-3 pr-6 text-right"
                aria-sort={ariaSortFor("unitPrice")}
                style={getColumnStyle("unitPrice")}
              >
                <button
                  type="button"
                  onClick={() => handleSort("unitPrice")}
                  className={headerButtonRightClass}
                >
                  Preco unitario
                  {renderSortIcon("unitPrice")}
                </button>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  className="absolute top-0 right-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center"
                  onPointerDown={(event) => handleResizeStart("unitPrice", event)}
                >
                  <span className="pointer-events-none h-8 w-[3px] rounded-full bg-white/40 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                </span>
              </th>
              <th
                className="group relative py-3 pl-3 pr-6"
                aria-sort={ariaSortFor("category")}
                style={getColumnStyle("category")}
              >
                <button
                  type="button"
                  onClick={() => handleSort("category")}
                  className={headerButtonClass}
                >
                  Categoria
                  {renderSortIcon("category")}
                </button>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  className="absolute top-0 right-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center"
                  onPointerDown={(event) => handleResizeStart("category", event)}
                >
                  <span className="pointer-events-none h-8 w-[3px] rounded-full bg-white/40 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                </span>
              </th>
              <th
                className="group relative py-3 pl-3 pr-6"
                aria-sort={ariaSortFor("supplier")}
                style={getColumnStyle("supplier")}
              >
                <button
                  type="button"
                  onClick={() => handleSort("supplier")}
                  className={headerButtonClass}
                >
                  Fornecedor
                  {renderSortIcon("supplier")}
                </button>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  className="absolute top-0 right-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center"
                  onPointerDown={(event) => handleResizeStart("supplier", event)}
                >
                  <span className="pointer-events-none h-8 w-[3px] rounded-full bg-white/40 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                </span>
              </th>
              <th
                className="group relative py-3 pl-3 pr-6 text-right"
                aria-sort={ariaSortFor("quantity")}
                style={getColumnStyle("quantity")}
              >
                <button
                  type="button"
                  onClick={() => handleSort("quantity")}
                  className={headerButtonRightClass}
                >
                  Quantidade
                  {renderSortIcon("quantity")}
                </button>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  className="absolute top-0 right-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center"
                  onPointerDown={(event) => handleResizeStart("quantity", event)}
                >
                  <span className="pointer-events-none h-8 w-[3px] rounded-full bg-white/40 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                </span>
              </th>
              <th
                className="group relative py-3 pl-3 pr-6 text-right"
                aria-sort={ariaSortFor("estoqueMinimo")}
                style={getColumnStyle("estoqueMinimo")}
              >
                <button
                  type="button"
                  onClick={() => handleSort("estoqueMinimo")}
                  className={headerButtonRightClass}
                >
                  Estoque minimo
                  {renderSortIcon("estoqueMinimo")}
                </button>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  className="absolute top-0 right-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center"
                  onPointerDown={(event) => handleResizeStart("estoqueMinimo", event)}
                >
                  <span className="pointer-events-none h-8 w-[3px] rounded-full bg-white/40 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                </span>
              </th>
              <th
                className="group relative py-3 pl-3 pr-6 text-right"
                aria-sort={ariaSortFor("totalValue")}
                style={getColumnStyle("totalValue")}
              >
                <button
                  type="button"
                  onClick={() => handleSort("totalValue")}
                  className={headerButtonRightClass}
                >
                  Valor total
                  {renderSortIcon("totalValue")}
                </button>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  className="absolute top-0 right-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center"
                  onPointerDown={(event) => handleResizeStart("totalValue", event)}
                >
                  <span className="pointer-events-none h-8 w-[3px] rounded-full bg-white/40 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                </span>
              </th>
            </tr>
          </thead>



        <tbody className="divide-y divide-slate-100 bg-white text-sm dark:divide-slate-800 dark:bg-slate-900">



            {sortedProducts.length ? (



              sortedProducts.map((product) => {







                const draft = drafts[product.id] ?? {};







                const merged = { ...product, ...draft };







                const insight = ensureInsight(product.id);







                const quantityValue =







                  typeof merged.quantity === "number" ? merged.quantity : Number(merged.quantity ?? 0);







                const rawMinimo = (merged as Product & { estoqueMinimo?: number }).estoqueMinimo;







                const parsedMinimo = typeof rawMinimo === "number" ? rawMinimo : Number(rawMinimo ?? 0);







                const normalizedMinimo = Number.isFinite(parsedMinimo) ? Math.max(0, parsedMinimo) : 0;







                const badge = stockBadgeFor(quantityValue, normalizedMinimo);







                const tooltip = formatInsightTooltip(insight);







                const kitList = Array.isArray(product.kits) ? product.kits : [];







                const isExpanded = kitsEnabled && expandedSet.has(product.id);







                return (







                  <Fragment key={product.id}>







                    <tr className="hover:bg-slate-50">







                      <td className="px-3 py-2">







                        <input







                          type="checkbox"







                          checked={selected.includes(product.id)}







                          onChange={() => toggleSelection(product.id)}







                        />







                      </td>







                      {kitsEnabled ? (







                        <td className="px-2 py-2 align-top">







                          <Button







                            type="button"







                            variant="outline"







                            size="sm"







                            className="h-8 w-8 p-0"







                            onClick={() => handleToggleExpand(product.id)}







                            disabled={!onToggleExpand}







                            aria-label={isExpanded ? "Recolher kits" : "Expandir kits"}







                          >







                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}







                          </Button>







                        </td>







                      ) : null}







                      <td className="px-3 py-2 align-top">







                        <Input







                          value={merged.name}







                          onChange={(event) => handleDraftChange(product.id, "name", event.target.value)}







                          onBlur={() => commitChanges(product.id)}







                          title={merged.name ?? ""}







                          className="h-auto min-h-[40px] w-full whitespace-normal break-words text-base md:text-[15px] lg:text-base md:whitespace-nowrap md:truncate"







                        />







                      </td>







                      <td className="px-3 py-2 align-top">







                        <Input







                          value={merged.sku}







                          onChange={(event) => handleDraftChange(product.id, "sku", event.target.value)}







                          onBlur={() => commitChanges(product.id)}







                          title={merged.sku ?? ""}







                          className="h-10 w-full text-sm md:text-[13px] lg:text-sm"







                        />







                      </td>







                      <td className="px-3 py-2 align-top">







                        <Input







                          type="number"







                          min="0"







                          step="0.01"







                          value={merged.unitPrice}







                          onChange={(event) =>







                            handleDraftChange(product.id, "unitPrice", Number(event.target.value))







                          }







                          onBlur={() => commitChanges(product.id)}







                          title={merged.unitPrice?.toString() ?? ""}







                          className="h-10 w-full text-right text-sm md:text-[13px] lg:text-sm"







                        />







                      </td>







                      <td className="px-3 py-2 align-top">







                        <Select







                          value={merged.category ?? ""}







                          onChange={(event) => handleDraftChange(product.id, "category", event.target.value)}







                          onBlur={() => commitChanges(product.id)}







                          className="h-10 w-full text-sm md:text-[13px] lg:text-sm"







                          title={merged.category ?? "Sem categoria"}







                        >







                          <option value="">Sem categoria</option>







                          {categories.map((category) => (







                            <option key={category} value={category}>







                              {category}







                            </option>







                          ))}







                        </Select>







                      </td>







                      <td className="px-3 py-2 align-top">







                        <Select







                          value={merged.supplier ?? ""}







                          onChange={(event) => handleDraftChange(product.id, "supplier", event.target.value)}







                          onBlur={() => commitChanges(product.id)}







                          className="h-10 w-full text-sm md:text-[13px] lg:text-sm"







                          title={merged.supplier ?? "Sem fornecedor"}







                        >







                          <option value="">Sem fornecedor</option>







                          {suppliers.map((supplier) => (







                            <option key={supplier} value={supplier}>







                              {supplier}







                            </option>







                          ))}







                        </Select>







                      </td>







                      <td className="px-3 py-2 align-top">







                        <Input







                          type="number"







                          min="0"







                          value={merged.quantity}







                          onChange={(event) => handleDraftChange(product.id, "quantity", Number(event.target.value))}







                          onBlur={() => commitChanges(product.id)}







                          title={merged.quantity?.toString() ?? ""}







                          className="h-10 w-full text-right text-sm md:text-[13px] lg:text-sm"







                        />







                      </td>







                      <td className="px-3 py-2 align-top">







                        <div className="space-y-1">







                          <Input







                            type="number"







                            min="0"







                            value={normalizedMinimo}







                            onChange={(event) =>







                              handleDraftChange(product.id, "estoqueMinimo", Number(event.target.value))







                            }







                            onBlur={() => commitChanges(product.id)}







                            title={normalizedMinimo.toLocaleString("pt-BR")}







                            className="h-10 w-full text-right text-sm md:text-[13px] lg:text-sm"







                          />







                          <div







                            className={`rounded px-2 py-1 text-xs font-medium ${badge.className}`}







                            title={tooltip}







                            aria-label={tooltip}







                          >







                            {badge.label}







                          </div>







                        </div>







                      </td>







                      <td className="px-3 py-2 text-right font-semibold align-top" title={formatCurrency(product.totalValue ?? 0)}>







                        {saving === product.id ? "Salvando..." : formatCurrency(product.totalValue)}







                      </td>







                    </tr>







                    {kitsEnabled && isExpanded ? (







                      <>







                        {kitList.length ? kitList.map((kit) => {







                          const kitRowColSpan = totalColumns - 2;







                          const kitName = kit.label && kit.label.trim().length ? kit.label : kit.sku;







                          return (







                            <tr key={`${product.id}-kit-${kit.sku}`} className="bg-slate-50 text-slate-600">







                              <td className="px-3 py-2"></td>







                              <td className="px-2 py-2"></td>







                              <td colSpan={kitRowColSpan} className="px-3 py-3">







                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">







                                  <div>







                                    <div className="font-medium text-slate-700">{kitName}</div>







                                    <div className="text-xs text-slate-500">SKU: {kit.sku}</div>







                                    <div className="text-xs text-slate-500">Multiplicador: x{kit.multiplier}</div>







                                  </div>







                                  <div className="flex flex-wrap gap-2">







                                    <Button type="button" size="sm" variant="outline" onClick={() => handleCopyKitSku(kit.sku)}>







                                      <Copy className="mr-1 h-4 w-4" /> Copiar SKU







                                    </Button>







                                    {onGenerateKitLabel ? (







                                      <Button type="button" size="sm" variant="outline" onClick={() => onGenerateKitLabel(product, kit)}>







                                        <Printer className="mr-1 h-4 w-4" /> Etiqueta







                                      </Button>







                                    ) : null}







                                    {onEditKit ? (







                                      <Button type="button" size="sm" variant="outline" onClick={() => onEditKit(product, kit)}>







                                        <Pencil className="mr-1 h-4 w-4" /> Editar







                                      </Button>







                                    ) : null}







                                    {onDeleteKit ? (







                                      <Button







                                        type="button"







                                        size="sm"







                                        variant="destructive"







                                        onClick={() => handleDeleteKit(product, kit)}







                                      >







                                        <Trash2 className="mr-1 h-4 w-4" /> Excluir







                                      </Button>







                                    ) : null}







                                  </div>







                                </div>







                              </td>







                            </tr>







                          );







                        }) : (







                          <tr className="bg-slate-50 text-slate-500">







                            <td className="px-3 py-2"></td>







                            <td className="px-2 py-2"></td>







                            <td colSpan={totalColumns - 2} className="px-3 py-3 text-sm">







                              Nenhum kit cadastrado ainda.







                            </td>







                          </tr>







                        )}







                        <tr className="bg-slate-50">







                          <td className="px-3 py-2"></td>







                          <td className="px-2 py-2"></td>







                          <td colSpan={totalColumns - 2} className="px-3 py-3">







                            {onCreateKit ? (







                              <Button type="button" size="sm" variant="outline" onClick={() => onCreateKit(product)}>







                                <Plus className="mr-1 h-4 w-4" /> Adicionar kit







                              </Button>







                            ) : null}







                          </td>







                        </tr>







                      </>







                    ) : null}







                  </Fragment>







                );







              })











            ) : (



              <tr>



                <td colSpan={totalColumns} className="px-3 py-6 text-center text-slate-500">



                  {products.length ? "Nenhum produto encontrado para a pesquisa." : "Nenhum produto cadastrado ainda."}



                </td>



              </tr>



            )}



          </tbody>



        </table>



      </div>







      {selectedProducts.length > 0 && (



        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">



          {selectedProducts.length} produto(s) selecionado(s).



        </div>



      )}



    </div>



  );



}




































































































