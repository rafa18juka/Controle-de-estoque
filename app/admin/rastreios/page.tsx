"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { ProtectedRoute } from "@/components/protected-route";
import { RoleGate } from "@/components/role-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  deleteTrackingCode,
  fetchMovementUsers,
  fetchTrackingCodes,
  type MovementUserOption
} from "@/lib/firestore";
import type { TrackingCodeProductLink, TrackingCodeRecord } from "@/lib/types";

interface TrackingFilters {
  code: string;
  userId: string;
  startDate: string;
  endDate: string;
}

const DEFAULT_FILTERS: TrackingFilters = { code: "", userId: "", startDate: "", endDate: "" };

export default function TrackingPage() {
  return (
    <ProtectedRoute>
      <RoleGate allow={["admin"]}>
        <TrackingContent />
      </RoleGate>
    </ProtectedRoute>
  );
}

function TrackingContent() {
  const [users, setUsers] = useState<MovementUserOption[]>([]);
  const [formFilters, setFormFilters] = useState<TrackingFilters>(DEFAULT_FILTERS);
  const [filters, setFilters] = useState<TrackingFilters>(DEFAULT_FILTERS);
  const [records, setRecords] = useState<TrackingCodeRecord[]>([]);
  const [cursor, setCursor] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
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

  const loadRecords = useCallback(
    async (reset: boolean, startAfter?: any) => {
      const trimmedCode = filters.code.trim();
      const trimmedUser = filters.userId.trim();
      const range = buildDateRange(filters);
      const limit = trimmedCode ? 100 : 50;

      if (reset) {
        setLoading(true);
        setCursor(null);
        setHasMore(false);
      } else {
        setLoadingMore(true);
      }

      try {
        const response = await fetchTrackingCodes({
          limit,
          userId: trimmedUser || undefined,
          code: trimmedCode || undefined,
          range,
          ...(trimmedCode ? {} : { startAfter })
        });

        const fetched = trimmedCode
          ? [...response.records].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
          : response.records;

        if (reset) {
          setRecords(fetched);
        } else {
          setRecords((prev) => [...prev, ...fetched]);
        }

        if (trimmedCode) {
          setCursor(null);
          setHasMore(false);
        } else {
          setCursor(response.nextCursor ?? null);
          setHasMore(Boolean(response.nextCursor));
        }
      } catch (error) {
        console.error("Falha ao carregar rastreios", error);
        toast.error("Nao foi possivel carregar os rastreios.");
      } finally {
        if (reset) {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [filters]
  );

  useEffect(() => {
    void loadRecords(true);
  }, [loadRecords]);

  const handleFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const applied: TrackingFilters = {
        code: formFilters.code.trim(),
        userId: formFilters.userId,
        startDate: formFilters.startDate,
        endDate: formFilters.endDate
      };
      setFilters(applied);
      setFormFilters(applied);
    },
    [formFilters]
  );

  const handleResetFilters = useCallback(() => {
    setFormFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loading || loadingMore) return;
    await loadRecords(false, cursor);
  }, [cursor, hasMore, loadRecords, loading, loadingMore]);

  const handleDelete = useCallback(
    async (recordId: string) => {
      try {
        setDeletingId(recordId);
        await deleteTrackingCode(recordId);
        setRecords((prev) => prev.filter((record) => record.id !== recordId));
        toast.success("Rastreio removido.");
      } catch (error) {
        console.error("Falha ao remover rastreio", error);
        toast.error("Nao foi possivel excluir o rastreio.");
      } finally {
        setDeletingId(null);
      }
    },
    []
  );

  const totalLabel = useMemo(() => {
    const base = `${records.length} registro${records.length === 1 ? "" : "s"}`;
    return hasMore ? `${base} (mais disponiveis)` : base;
  }, [hasMore, records.length]);

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
        <h2 className="text-xl font-semibold text-slate-900">Rastreios registrados</h2>
        <p className="text-sm text-slate-500">
          Filtre por codigo, operador ou intervalo de datas para localizar comprovantes de rastreamento.
        </p>
        <form className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={handleFormSubmit}>
          <div className="space-y-2">
            <Label htmlFor="code">Codigo</Label>
            <Input
              id="code"
              value={formFilters.code}
              placeholder="BR1234567890123"
              onChange={(event) => setFormFilters((prev) => ({ ...prev, code: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user">Operador</Label>
            <Select
              id="user"
              value={formFilters.userId}
              onChange={(event) => setFormFilters((prev) => ({ ...prev, userId: event.target.value }))}
            >
              <option value="">Todos</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="startDate">Data inicial</Label>
            <Input
              id="startDate"
              type="date"
              value={formFilters.startDate}
              onChange={(event) => setFormFilters((prev) => ({ ...prev, startDate: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate">Data final</Label>
            <Input
              id="endDate"
              type="date"
              value={formFilters.endDate}
              onChange={(event) => setFormFilters((prev) => ({ ...prev, endDate: event.target.value }))}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? "Carregando..." : "Aplicar filtros"}
            </Button>
            <Button type="button" variant="ghost" onClick={handleResetFilters} disabled={loading}>
              Limpar
            </Button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-lg font-semibold text-slate-900">Resultados</h3>
        </div>
        {loading && records.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">Carregando rastreios...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-left">Codigo</th>
                  <th className="px-4 py-3 text-left">SKU vinculado</th>
                  <th className="px-4 py-3 text-left">Produto</th>
                  <th className="px-4 py-3 text-left">Operador</th>
                  <th className="px-4 py-3 text-right">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={6}>
                      Nenhum rastreio encontrado.
                    </td>
                  </tr>
                ) : (
                  records.map((record) => {
                    const dateLabel = formatDateTime(record.createdAt);
                    const productLinks: TrackingCodeProductLink[] =
                      record.products && record.products.length
                        ? record.products
                        : record.productSku
                          ? [
                              {
                                sku: record.productSku,
                                name: record.productName ?? undefined
                              }
                            ]
                          : [];
                    return (
                      <tr key={`${record.id}-${record.createdAt}`} className="text-slate-700">
                        <td className="whitespace-nowrap px-4 py-3">{dateLabel}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs uppercase">{record.code}</td>
                        <td className="px-4 py-3 font-mono text-xs uppercase">
                          {productLinks.length ? (
                            <div className="flex flex-col gap-1">
                              {productLinks.map((item, index) => (
                                <span key={`${item.sku}-${index}`}>{item.sku}</span>
                              ))}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {productLinks.length ? (
                            <div className="flex flex-col gap-1">
                              {productLinks.map((item, index) => (
                                <span key={`${item.sku}-${index}`}>
                                  {item.name ?? "-"}
                                  {typeof item.quantity === "number" ? ` | ${item.quantity} un.` : ""}
                                  {item.scannedSku && item.scannedSku !== item.sku ? ` | escaneado: ${item.scannedSku}` : ""}
                                </span>
                              ))}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-4 py-3">{record.userName || record.userId}</td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-rose-500 hover:text-rose-600"
                            onClick={() => handleDelete(record.id)}
                            disabled={deletingId === record.id}
                            aria-label="Excluir rastreio"
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
        )}
        <div className="flex items-center justify-between px-4 py-3 text-sm text-slate-500">
          <span>{totalLabel}</span>
          <Button type="button" variant="outline" disabled={!hasMore || loadingMore || loading} onClick={handleLoadMore}>
            {loadingMore ? "Carregando..." : hasMore ? "Carregar mais" : "Fim da lista"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function buildDateRange(filters: TrackingFilters) {
  const hasStart = Boolean(filters.startDate);
  const hasEnd = Boolean(filters.endDate);
  if (!hasStart && !hasEnd) {
    return undefined;
  }
  const start = hasStart ? new Date(`${filters.startDate}T00:00:00`) : undefined;
  const end = hasEnd ? new Date(`${filters.endDate}T23:59:59`) : undefined;
  return {
    start: start && !Number.isNaN(start.getTime()) ? start : undefined,
    end: end && !Number.isNaN(end.getTime()) ? end : undefined
  };
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



