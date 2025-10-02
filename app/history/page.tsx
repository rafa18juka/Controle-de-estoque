"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { ProtectedRoute } from "@/components/protected-route";
import { RoleGate } from "@/components/role-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  deleteStockMovement,
  fetchMovementUsers,
  fetchStockMovements,
  fetchStockMovementsForExport,
  type MovementUserOption,
  type StockMovementWithProduct
} from "@/lib/firestore";

type IntervalOption = "today" | "week" | "month" | "year" | "custom";

type MovementTypeFilter = "out" | "in";

interface HistoryFilters {
  interval: IntervalOption;
  startDate: string;
  endDate: string;
  sku: string;
  userId: string;
  type: MovementTypeFilter;
}

export default function HistoryPage() {
  return (
    <ProtectedRoute>
      <RoleGate allow={["admin", "staff"]}>
        <HistoryContent />
      </RoleGate>
    </ProtectedRoute>
  );
}

function HistoryContent() {
  const [filters, setFilters] = useState<HistoryFilters>({
    interval: "today",
    startDate: "",
    endDate: "",
    sku: "",
    userId: "",
    type: "out"
  });
  const [users, setUsers] = useState<MovementUserOption[]>([]);
  const [movements, setMovements] = useState<StockMovementWithProduct[]>([]);
  const [cursor, setCursor] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadUsers = async () => {
      try {
        const result = await fetchMovementUsers();
        if (!active) return;
        setUsers(result.sort((a, b) => a.name.localeCompare(b.name)));
      } catch (error) {
        console.error("Falha ao carregar usuarios", error);
        toast.error("Nao foi possivel carregar os usuarios.");
      }
    };

    loadUsers();

    return () => {
      active = false;
    };
  }, []);

  const range = useMemo(() => computeDateRange(filters), [filters]);

  const loadMovements = useCallback(
    async (reset: boolean, startAfter?: any) => {
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const response = await fetchStockMovements({
          limit: 25,
          startAfter: reset ? null : startAfter,
          sku: filters.sku.trim() || undefined,
          userId: filters.userId || undefined,
          type: filters.type || undefined,
          range
        });

        setCursor(response.nextCursor ?? null);
        setHasMore(Boolean(response.nextCursor));
        setMovements((prev) => (reset ? response.movements : [...prev, ...response.movements]));
      } catch (error) {
        console.error("Falha ao carregar historico", error);
        toast.error("Nao foi possivel carregar o historico.");
      } finally {
        if (reset) {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [filters.sku, filters.type, filters.userId, range]
  );

  useEffect(() => {
    setCursor(null);
    setHasMore(false);
    setMovements([]);
    void loadMovements(true);
  }, [loadMovements]);

  const handleIntervalChange = (value: IntervalOption) => {
    setFilters((prev) => ({
      ...prev,
      interval: value,
      ...(value === "custom" ? {} : { startDate: "", endDate: "" })
    }));
  };

  const handleFilterChange = (partial: Partial<HistoryFilters>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  };

  const handleLoadMore = () => {
    if (!hasMore || loading || loadingMore) return;
    void loadMovements(false, cursor);
  };

  const handleDeleteMovement = useCallback(
    async (movementId: string) => {
      const target = movements.find((movement) => movement.id === movementId);
      const skuLabel = target?.scannedSku ?? target?.sku ?? "";
      const nameLabel = target?.productName ? ` (${target.productName})` : "";
      const confirmationMessage =
        skuLabel
          ? `Deseja excluir o registro do SKU ${skuLabel}${nameLabel}? Essa acao devolve o estoque.`
          : "Deseja excluir este registro do historico? Essa acao devolve o estoque.";

      if (typeof window !== "undefined") {
        const confirmed = window.confirm(confirmationMessage);
        if (!confirmed) {
          return;
        }
      }

      setDeletingId(movementId);
      try {
        await deleteStockMovement(movementId);
        setMovements((prev) => prev.filter((movement) => movement.id !== movementId));
        toast.success("Registro excluido com sucesso.");
      } catch (error) {
        console.error("Falha ao excluir movimento", error);
        toast.error("Nao foi possivel excluir o registro.");
      } finally {
        setDeletingId(null);
      }
    },
    [movements]
  );

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await fetchStockMovementsForExport({
        sku: filters.sku.trim() || undefined,
        userId: filters.userId || undefined,
        type: filters.type || undefined,
        range
      });

      if (!data.length) {
        toast.info("Nenhum registro para exportar.");
        return;
      }

      const header = ["Data/Hora", "SKU pai", "SKU escaneado", "Produto", "Quantidade", "Multiplicador", "Usuario"];
      const rows = data.map((movement) => [
        formatDateTime(movement.timestamp),
        movement.sku,
        movement.scannedSku ?? movement.sku,
        movement.productName || "",
        String(movement.qty > 0 ? -Math.abs(movement.qty) : movement.qty),
        String(movement.multiplier ?? 1),
        movement.userName || movement.userId
      ]);

      const csv = [header, ...rows]
        .map((row) => row.map(csvEscape).join(","))
        .join("\n");

      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `historico-${new Date().toISOString()}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success("CSV exportado.");
    } catch (error) {
      console.error("Falha ao exportar CSV", error);
      toast.error("Nao foi possivel exportar o CSV.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Historico de movimentos</h1>
            <p className="text-sm text-slate-500">Filtre e exporte as saidas de estoque registradas.</p>
          </div>
          <Button type="button" variant="outline" disabled={exporting || loading} onClick={handleExport}>
            {exporting ? "Exportando..." : "Exportar CSV"}
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="interval">Intervalo</Label>
            <Select
              id="interval"
              value={filters.interval}
              onChange={(event) => handleIntervalChange(event.target.value as IntervalOption)}
            >
              <option value="today">Hoje</option>
              <option value="week">Semana</option>
              <option value="month">Mes</option>
              <option value="year">Ano</option>
              <option value="custom">Personalizado</option>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sku">SKU</Label>
            <Input
              id="sku"
              value={filters.sku}
              placeholder="Pesquisar por SKU"
              onChange={(event) => handleFilterChange({ sku: event.target.value })}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="user">Usuario</Label>
            <Select
              id="user"
              value={filters.userId}
              onChange={(event) => handleFilterChange({ userId: event.target.value })}
            >
              <option value="">Todos</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="type">Tipo</Label>
            <Select
              id="type"
              value={filters.type}
              onChange={(event) => handleFilterChange({ type: event.target.value as MovementTypeFilter })}
            >
              <option value="out">Saidas</option>
            </Select>
          </div>
        </div>

        {filters.interval === "custom" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="start-date">Inicio</Label>
              <Input
                id="start-date"
                type="date"
                value={filters.startDate}
                onChange={(event) => handleFilterChange({ startDate: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="end-date">Fim</Label>
              <Input
                id="end-date"
                type="date"
                value={filters.endDate}
                onChange={(event) => handleFilterChange({ endDate: event.target.value })}
              />
            </div>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Data/Hora</th>
                <th className="px-4 py-3">SKU pai</th>
                <th className="px-4 py-3">SKU escaneado</th>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Quantidade (-)</th>
                <th className="px-4 py-3">Multiplicador</th>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && movements.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={8}>
                    Carregando historico...
                  </td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-400" colSpan={8}>
                    Nenhum movimento encontrado para o filtro atual.
                  </td>
                </tr>
              ) : (
                movements.map((movement) => {
                  const scannedSku = movement.scannedSku ?? movement.sku;
                  const isKit = Boolean(movement.scannedSku && movement.scannedSku !== movement.sku);
                  const multiplierValue = Number(movement.multiplier ?? 1);
                  const multiplierDisplay = isKit || multiplierValue !== 1 ? `x${multiplierValue}` : "-";
                  return (
                    <tr key={`${movement.id}-${movement.timestamp}`} className="text-slate-700">
                      <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(movement.timestamp)}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs uppercase">{movement.sku}</td>
                      <td
                        className="px-4 py-3 whitespace-nowrap font-mono text-xs uppercase"
                        title={isKit ? "SKU de kit escaneado" : undefined}
                      >
                        {scannedSku}
                      </td>
                      <td className="px-4 py-3">{movement.productName || "-"}</td>
                      <td className="px-4 py-3 font-semibold text-rose-600">-{Math.abs(movement.qty)}</td>
                      <td className="px-4 py-3">{multiplierDisplay}</td>
                      <td className="px-4 py-3">{movement.userName || movement.userId}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-rose-500 hover:text-rose-600"
                          onClick={() => handleDeleteMovement(movement.id)}
                          disabled={deletingId === movement.id}
                          aria-label="Excluir registro"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 text-sm text-slate-500">
          <span>
            {movements.length} registro{movements.length === 1 ? "" : "s"}
            {hasMore ? " (mais disponiveis)" : ""}
          </span>
          <Button type="button" variant="outline" disabled={!hasMore || loadingMore || loading} onClick={handleLoadMore}>
            {loadingMore ? "Carregando..." : hasMore ? "Carregar mais" : "Fim da lista"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function computeDateRange(filters: HistoryFilters) {
  const now = new Date();

  const startOfDay = (date: Date) => {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  const endOfDay = (date: Date) => {
    const copy = new Date(date);
    copy.setHours(23, 59, 59, 999);
    return copy;
  };

  switch (filters.interval) {
    case "today": {
      const start = startOfDay(now);
      const end = endOfDay(now);
      return { start, end };
    }
    case "week": {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff));
      const end = endOfDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6));
      return { start, end };
    }
    case "month": {
      const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      const end = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return { start, end };
    }
    case "year": {
      const start = startOfDay(new Date(now.getFullYear(), 0, 1));
      const end = endOfDay(new Date(now.getFullYear(), 11, 31));
      return { start, end };
    }
    case "custom": {
      const start = filters.startDate ? startOfDay(new Date(`${filters.startDate}T00:00:00`)) : null;
      const end = filters.endDate ? endOfDay(new Date(`${filters.endDate}T00:00:00`)) : null;
      return { start: start ?? undefined, end: end ?? undefined };
    }
    default:
      return {};
  }
}

function formatDateTime(timestamp: number) {
  if (!timestamp) {
    return "-";
  }
  return new Date(timestamp).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function csvEscape(value: string) {
  const safe = value.replace(/"/g, '""');
  return `"${safe}"`;
}









