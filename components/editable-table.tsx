"use client";

import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Product } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface EditableTableProps {
  products: Product[];
  categories: string[];
  suppliers: string[];
  onChange: (id: string, changes: Partial<Product>) => Promise<void>;
  onDelete: (ids: string[]) => Promise<void>;
  onCreate: () => void;
  onGenerateLabels: (products: Product[], quantity: number) => void;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
  onSeed: () => void;
  onManageCategories: () => void;
  onManageSuppliers: () => void;
}

type SortKey = "name" | "sku" | "unitPrice" | "category" | "supplier" | "quantity" | "totalValue";

export function EditableTable({
  products,
  categories,
  suppliers,
  onChange,
  onDelete,
  onCreate,
  onGenerateLabels,
  onExport,
  onImport,
  onSeed,
  onManageCategories,
  onManageSuppliers
}: EditableTableProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Partial<Product>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortState, setSortState] = useState<{ key: SortKey; order: "asc" | "desc" }>({ key: "name", order: "asc" });
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!trimmedTerm) return products;

    const normalizedTerm = trimmedTerm
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    const matches = (value: unknown) => {
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
      return (
        matches(merged.name) ||
        matches(merged.sku) ||
        matches(merged.category) ||
        matches(merged.supplier)
      );
    });
  }, [products, drafts, searchTerm]);

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
        <div className="w-full max-w-md xl:ml-auto">
          <div className="relative">
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
        <table className="w-full min-w-[1000px] table-auto divide-y divide-slate-200">
          <colgroup>
            <col className="w-[48px]" />
            <col className="min-w-[240px] md:min-w-[280px]" />
            <col className="w-[120px]" />
            <col className="w-[140px]" />
            <col className="w-[150px]" />
            <col className="w-[150px]" />
            <col className="w-[120px]" />
            <col className="w-[150px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-white text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => handleToggleAllVisible(event.target.checked)}
                  aria-checked={someVisibleSelected && !allVisibleSelected ? "mixed" : allVisibleSelected}
                  title="Selecionar resultados visiveis"
                />
              </th>
              <th
                className="px-3 py-3"
                aria-sort={ariaSortFor("name")}
              >
                <button
                  type="button"
                  onClick={() => handleSort("name")}
                  className="flex items-center gap-1 text-slate-600 transition-colors hover:text-blue-600 focus:outline-none"
                >
                  Nome
                  {renderSortIcon("name")}
                </button>
              </th>
              <th
                className="px-3 py-3"
                aria-sort={ariaSortFor("sku")}
              >
                <button
                  type="button"
                  onClick={() => handleSort("sku")}
                  className="flex items-center gap-1 text-slate-600 transition-colors hover:text-blue-600 focus:outline-none"
                >
                  SKU
                  {renderSortIcon("sku")}
                </button>
              </th>
              <th
                className="px-3 py-3 text-right"
                aria-sort={ariaSortFor("unitPrice")}
              >
                <button
                  type="button"
                  onClick={() => handleSort("unitPrice")}
                  className="flex w-full items-center justify-end gap-1 text-slate-600 transition-colors hover:text-blue-600 focus:outline-none"
                >
                  Preço unitário
                  {renderSortIcon("unitPrice")}
                </button>
              </th>
              <th
                className="px-3 py-3"
                aria-sort={ariaSortFor("category")}
              >
                <button
                  type="button"
                  onClick={() => handleSort("category")}
                  className="flex items-center gap-1 text-slate-600 transition-colors hover:text-blue-600 focus:outline-none"
                >
                  Categoria
                  {renderSortIcon("category")}
                </button>
              </th>
              <th
                className="px-3 py-3"
                aria-sort={ariaSortFor("supplier")}
              >
                <button
                  type="button"
                  onClick={() => handleSort("supplier")}
                  className="flex items-center gap-1 text-slate-600 transition-colors hover:text-blue-600 focus:outline-none"
                >
                  Fornecedor
                  {renderSortIcon("supplier")}
                </button>
              </th>
              <th
                className="px-3 py-3 text-right"
                aria-sort={ariaSortFor("quantity")}
              >
                <button
                  type="button"
                  onClick={() => handleSort("quantity")}
                  className="flex w-full items-center justify-end gap-1 text-slate-600 transition-colors hover:text-blue-600 focus:outline-none"
                >
                  Quantidade
                  {renderSortIcon("quantity")}
                </button>
              </th>
              <th
                className="px-3 py-3 text-right"
                aria-sort={ariaSortFor("totalValue")}
              >
                <button
                  type="button"
                  onClick={() => handleSort("totalValue")}
                  className="flex w-full items-center justify-end gap-1 text-slate-600 transition-colors hover:text-blue-600 focus:outline-none"
                >
                  Valor total
                  {renderSortIcon("totalValue")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white text-sm">
            {sortedProducts.length ? (
              sortedProducts.map((product) => {
                const draft = drafts[product.id] ?? {};
                const merged = { ...product, ...draft };
                return (
                  <tr key={product.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(product.id)}
                        onChange={() => toggleSelection(product.id)}
                      />
                    </td>
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
                    <td className="px-3 py-2 text-right font-semibold align-top" title={formatCurrency(product.totalValue ?? 0)}>
                      {saving === product.id ? "Salvando..." : formatCurrency(product.totalValue)}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
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


















