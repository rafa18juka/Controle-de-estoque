"use client";

import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import dynamic from "next/dynamic";

import { ProtectedRoute } from "@/components/protected-route";
import { RoleGate } from "@/components/role-gate";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { StatsCard } from "@/components/stats-card";
import { ensureFirebase } from "@/lib/firebase-client";
import type { Product, StockMovement } from "@/lib/types";
import { currency, formatDay } from "@/lib/format";

type MovementRange = "day" | "week" | "month" | "year";

const BarTimeseries = dynamic(
  () => import("@/components/charts/bar-timeseries").then((mod) => mod.BarTimeseries),
  { ssr: false }
);
const Donut = dynamic(
  () => import("@/components/charts/donut").then((mod) => mod.Donut),
  { ssr: false }
);

const MOVEMENT_RANGE_OPTIONS: { value: MovementRange; label: string }[] = [
  { value: "day", label: "Por dia (30 dias)" },
  { value: "week", label: "Por semana (12 semanas)" },
  { value: "month", label: "Por mes (12 meses)" },
  { value: "year", label: "Por ano (5 anos)" }
];

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <RoleGate allow={["admin"]}>
        <DashboardContent />
      </RoleGate>
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const [productFilter, setProductFilter] = useState<string>("");
  const [movementRange, setMovementRange] = useState<MovementRange>("day");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const bundle = await ensureFirebase();
        const { firestore } = bundle;
        const productsSnapshot = await firestore.getDocs(firestore.collection(bundle.db, "products"));
        const loadedProducts: Product[] = productsSnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
        setProducts(loadedProducts);
        const movementsSnapshot = await firestore.getDocs(firestore.collection(bundle.db, "stockMovements"));
        const loadedMovements: StockMovement[] = movementsSnapshot.docs.map((doc: any) => {
          const data = doc.data();
          const timestampValue =
            data.timestamp && typeof data.timestamp.toMillis === "function"
              ? data.timestamp.toMillis()
              : Number(data.timestamp ?? 0);
          return {
            id: doc.id,
            ...data,
            timestamp: timestampValue
          } as StockMovement;
        });
        setMovements(loadedMovements);
      } catch (error) {
        console.error(error);
        toast.error("Falha ao carregar dados do Firestore");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const categories = useMemo(() => {
    const unique = new Set(products.map((product) => product.category).filter(Boolean) as string[]);
    return Array.from(unique).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [products]);

  const suppliers = useMemo(() => {
    const unique = new Set(products.map((product) => product.supplier).filter(Boolean) as string[]);
    return Array.from(unique).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [products]);

  const productOptions = useMemo(() => {
    return products
      .filter((product) => {
        const matchCategory = categoryFilter ? product.category === categoryFilter : true;
        const matchSupplier = supplierFilter ? product.supplier === supplierFilter : true;
        return matchCategory && matchSupplier;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [products, categoryFilter, supplierFilter]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchCategory = categoryFilter ? product.category === categoryFilter : true;
      const matchSupplier = supplierFilter ? product.supplier === supplierFilter : true;
      const matchProduct = productFilter ? product.id === productFilter : true;
      return matchCategory && matchSupplier && matchProduct;
    });
  }, [products, categoryFilter, supplierFilter, productFilter]);

  const productMap = useMemo(() => {
    return new Map(filteredProducts.map((product) => [product.id, product]));
  }, [filteredProducts]);

  const filteredMovements = useMemo(() => {
    if (!categoryFilter && !supplierFilter && !productFilter) return movements;
    return movements.filter((movement) => productMap.has(movement.productId));
  }, [movements, productMap, categoryFilter, supplierFilter, productFilter]);

  const totalItems = filteredProducts.reduce((acc, product) => acc + (product.quantity ?? 0), 0);
  const totalValue = filteredProducts.reduce((acc, product) => acc + (product.totalValue ?? 0), 0);

  const valueByCategory = filteredProducts.reduce<Record<string, number>>((acc, product) => {
    const key = product.category ?? "Sem categoria";
    acc[key] = (acc[key] ?? 0) + (product.totalValue ?? 0);
    return acc;
  }, {});

  const valueBySupplier = filteredProducts.reduce<Record<string, number>>((acc, product) => {
    const key = product.supplier ?? "Sem fornecedor";
    acc[key] = (acc[key] ?? 0) + (product.totalValue ?? 0);
    return acc;
  }, {});

  const now = new Date();
  const thresholds = {
    today: startOfDay(now).getTime(),
    week: startOfWeek(now).getTime(),
    month: startOfMonth(now).getTime(),
    year: startOfYear(now).getTime()
  };

  const movementsWithProducts = filteredMovements
    .filter((movement) => movement.type === "out")
    .map((movement) => ({
      ...movement,
      product: productMap.get(movement.productId)
    }));

  const windowStats = (start: number) => {
    const relevant = movementsWithProducts.filter((movement) => movement.timestamp >= start);
    const totalQty = relevant.reduce((acc, movement) => acc + movement.qty, 0);
    const totalVal = relevant.reduce((acc, movement) => {
      const unitPrice = movement.product?.unitPrice ?? 0;
      return acc + unitPrice * movement.qty;
    }, 0);
    return { totalQty, totalVal };
  };

  const todayStats = windowStats(thresholds.today);
  const weekStats = windowStats(thresholds.week);
  const monthStats = windowStats(thresholds.month);
  const yearStats = windowStats(thresholds.year);

  const movementSeries = useMemo(() => {
    const reference = new Date();
    const segments: { label: string; start: number; end: number; date: Date }[] = [];

    if (movementRange === "day") {
      for (let index = 29; index >= 0; index -= 1) {
        const date = startOfDay(subDays(reference, index));
        segments.push({
          label: formatDay(date),
          start: date.getTime(),
          end: addDays(date, 1).getTime(),
          date
        });
      }
    } else if (movementRange === "week") {
      for (let index = 11; index >= 0; index -= 1) {
        const weekStart = startOfWeek(subWeeks(reference, index));
        segments.push({
          label: format(weekStart, "dd/MM", { locale: ptBR }),
          start: weekStart.getTime(),
          end: addWeeks(weekStart, 1).getTime(),
          date: weekStart
        });
      }
    } else if (movementRange === "month") {
      for (let index = 11; index >= 0; index -= 1) {
        const monthStart = startOfMonth(subMonths(reference, index));
        segments.push({
          label: format(monthStart, "MMM/yy", { locale: ptBR }),
          start: monthStart.getTime(),
          end: addMonths(monthStart, 1).getTime(),
          date: monthStart
        });
      }
    } else {
      for (let index = 4; index >= 0; index -= 1) {
        const yearStart = startOfYear(subYears(reference, index));
        segments.push({
          label: format(yearStart, "yyyy", { locale: ptBR }),
          start: yearStart.getTime(),
          end: addYears(yearStart, 1).getTime(),
          date: yearStart
        });
      }
    }

    return segments.map(({ label, start, end, date }) => {
      let totalQty = 0;
      let totalVal = 0;

      for (const movement of movementsWithProducts) {
        if (movement.timestamp >= start && movement.timestamp < end) {
          totalQty += movement.qty;
          const unitPrice = movement.product?.unitPrice ?? 0;
          totalVal += unitPrice * movement.qty;
        }
      }

      return {
        label,
        date: date.toISOString(),
        value: totalVal,
        quantity: totalQty
      };
    });
  }, [movementsWithProducts, movementRange]);

  const categoryDonutData = useMemo(
    () =>
      Object.entries(valueByCategory)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
    [valueByCategory]
  );

  const supplierDonutData = useMemo(
    () =>
      Object.entries(valueBySupplier)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
    [valueBySupplier]
  );

  const movementRangeLabel = MOVEMENT_RANGE_OPTIONS.find((option) => option.value === movementRange)?.label ?? "";

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard de Estoque</h1>
          <p className="text-sm text-slate-500">
            Visao geral do estoque atual, valor em prateleira e historico de saidas.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">Todas as categorias</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>
          <Select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}>
            <option value="">Todos os fornecedores</option>
            {suppliers.map((supplier) => (
              <option key={supplier} value={supplier}>
                {supplier}
              </option>
            ))}
          </Select>
          <Select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}>
            <option value="">Todos os produtos</option>
            {productOptions.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.sku})
              </option>
            ))}
          </Select>
          <Select value={movementRange} onChange={(event) => setMovementRange(event.target.value as MovementRange)}>
            {MOVEMENT_RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Button
            variant="ghost"
            onClick={() => {
              setCategoryFilter("");
              setSupplierFilter("");
              setProductFilter("");
            }}
          >
            Limpar filtros
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center text-slate-500">Carregando metricas...</div>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatsCard label="Itens em estoque" value={totalItems.toLocaleString("pt-BR")} />
            <StatsCard label="Valor em estoque" value={currency(totalValue)} />
            <StatsCard label="Saidas hoje" value={`${todayStats.totalQty} itens`} description={currency(todayStats.totalVal)} />
            <StatsCard label="Saidas na semana" value={`${weekStats.totalQty} itens`} description={currency(weekStats.totalVal)} />
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatsCard label="Saidas no mes" value={`${monthStats.totalQty} itens`} description={currency(monthStats.totalVal)} />
            <StatsCard label="Saidas no ano" value={`${yearStats.totalQty} itens`} description={currency(yearStats.totalVal)} />
            {categoryDonutData.length ? (
              <Donut data={categoryDonutData} title="Valor por categoria" />
            ) : (
              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Valor por categoria</h3>
                <p className="text-sm text-slate-500">Sem dados para exibir.</p>
              </div>
            )}
            {supplierDonutData.length ? (
              <Donut data={supplierDonutData} title="Valor por fornecedor" />
            ) : (
              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Valor por fornecedor</h3>
                <p className="text-sm text-slate-500">Sem dados para exibir.</p>
              </div>
            )}
          </section>

          <section className="grid gap-4">
            {movementSeries.length ? (
              <BarTimeseries
                data={movementSeries}
                title={`Saidas ${movementRangeLabel ? `(${movementRangeLabel.toLowerCase()})` : ""}`}
              />
            ) : (
              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Saidas {movementRangeLabel ? `(${movementRangeLabel.toLowerCase()})` : ""}
                </h3>
                <p className="text-sm text-slate-500">Sem movimentacoes para o periodo selecionado.</p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}










