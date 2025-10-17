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
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import dynamic from "next/dynamic";

import { ProtectedRoute } from "@/components/protected-route";
import { RoleGate } from "@/components/role-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { StatsCard } from "@/components/stats-card";
import { ensureFirebase } from "@/lib/firebase-client";
import { fetchMovementUsers, type MovementUserOption } from "@/lib/firestore";
import type { Product, StockMovement } from "@/lib/types";
import { currency, formatDay } from "@/lib/format";
import type { ProductsBarDatum } from "@/components/charts/products-bar";

type MovementRange = "day" | "week" | "month" | "year";
type DashboardTab = "stock" | "users";
type ProductLine = "A" | "B" | "C";
type IdleProductsMetric = "quantity" | "value";
type TopProductsMetric = "value" | "quantity" | "sales";
type TopProductsPeriod = "day" | "week" | "month";
type WaterfallRange = "week" | "month";

interface UserActivitySummary {
  id: string;
  name: string;
  totalActions: number;
  totalQuantity: number;
  totalValue: number;
  categories: Array<{ name: string; quantity: number }>;
  topProducts: Array<{ id: string; name: string; quantity: number }>;
  firstScan: number | null;
  lastScan: number | null;
}

interface DashboardUserOption {
  id: string;
  name: string;
  searchTokens: string[];
}

interface ProductSalesAggregate {
  key: string;
  productId?: string;
  name: string;
  totalValue: number;
  totalQuantity: number;
  saleCount: number;
}

function normalizeNameCandidate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const normalized = trimmed
    .split(/[.@\-_/]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
  if (normalized) {
    return normalized;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function deriveUserDisplayName(rawName: string | null | undefined, userId: string) {
  const tokens = new Set<string>();
  const safeRaw = typeof rawName === "string" ? rawName.trim() : "";
  if (safeRaw) {
    tokens.add(safeRaw.toLowerCase());
  }

  let emailLocal = "";
  if (safeRaw.includes("@")) {
    emailLocal = safeRaw.split("@")[0] ?? "";
    if (emailLocal) {
      tokens.add(emailLocal.toLowerCase());
    }
  }

  const candidates = [emailLocal, safeRaw].filter(Boolean);
  let name = "";
  for (const candidate of candidates) {
    const normalized = normalizeNameCandidate(candidate);
    if (normalized) {
      name = normalized;
      break;
    }
  }

  if (!name) {
    name = "Usuario";
  }

  tokens.add(name.toLowerCase());
  if (userId) {
    tokens.add(userId.toLowerCase());
  }

  return { name, tokens: Array.from(tokens) };
}

type MovementWithProduct = StockMovement & { product?: Product | undefined };

function resolveProductKey(movement: MovementWithProduct): string {
  return (
    movement.product?.id ||
    movement.productId ||
    movement.product?.sku ||
    movement.sku ||
    movement.product?.name ||
    movement.id
  );
}

function resolveProductName(movement: MovementWithProduct): string {
  return (
    movement.product?.name?.trim() ||
    movement.product?.sku ||
    movement.sku ||
    movement.productId ||
    movement.id ||
    "Sem produto"
  );
}

function aggregateProductSales(movements: MovementWithProduct[]): ProductSalesAggregate[] {
  if (!movements.length) {
    return [];
  }

  const totals = new Map<string, ProductSalesAggregate>();

  for (const movement of movements) {
    const rawQty = Number(movement.effectiveQty ?? movement.qty ?? 0);
    const quantity = Number.isFinite(rawQty) ? Math.abs(rawQty) : 0;
    const unitPrice = Number(movement.product?.unitPrice ?? movement.unitPrice ?? 0);
    const value = quantity * unitPrice;
    const key = resolveProductKey(movement);
    const name = resolveProductName(movement);

    const existing = totals.get(key) ?? {
      key,
      productId: movement.product?.id ?? movement.productId ?? undefined,
      name,
      totalValue: 0,
      totalQuantity: 0,
      saleCount: 0
    };

    if (!existing.name || existing.name === "Sem produto") {
      existing.name = name;
    }

    existing.totalQuantity += quantity;
    existing.totalValue += value;
    existing.saleCount += 1;

    totals.set(key, existing);
  }

  return Array.from(totals.values());
}

const BarTimeseries = dynamic(
  () => import("@/components/charts/bar-timeseries").then((mod) => mod.BarTimeseries),
  { ssr: false }
);
const Donut = dynamic(() => import("@/components/charts/donut").then((mod) => mod.Donut), { ssr: false });
const UserComparisonChart = dynamic(
  () => import("@/components/charts/user-comparison").then((mod) => mod.UserComparisonChart),
  { ssr: false }
);
const ProductsBarChart = dynamic(
  () => import("@/components/charts/products-bar").then((mod) => mod.ProductsBarChart),
  { ssr: false }
);
const LineTimeseries = dynamic(
  () => import("@/components/charts/line-timeseries").then((mod) => mod.LineTimeseries),
  { ssr: false }
);

// Keep supplier donut legend compact when many fornecedores.
const SUPPLIER_DONUT_MAX_SLICES = 8;

const PRODUCT_LINE_OPTIONS: Array<{ value: "all" | ProductLine; label: string }> = [
  { value: "all", label: "Todas as linhas" },
  { value: "A", label: "Linha A" },
  { value: "B", label: "Linha B" },
  { value: "C", label: "Linha C" }
];

const IDLE_METRIC_OPTIONS: Array<{ value: IdleProductsMetric; label: string }> = [
  { value: "quantity", label: "Por unidades" },
  { value: "value", label: "Por valor" }
];

const TOP_PRODUCTS_METRIC_OPTIONS: Array<{ value: TopProductsMetric; label: string }> = [
  { value: "value", label: "Por valor" },
  { value: "quantity", label: "Por unidades" },
  { value: "sales", label: "Por vendas" }
];

const TOP_PRODUCTS_PERIOD_OPTIONS: Array<{ value: TopProductsPeriod; label: string }> = [
  { value: "day", label: "Ultimas 24h" },
  { value: "week", label: "Ultimos 7 dias" },
  { value: "month", label: "Ultimos 30 dias" }
];

const WATERFALL_RANGE_OPTIONS: Array<{ value: WaterfallRange; label: string }> = [
  { value: "week", label: "Ultima semana" },
  { value: "month", label: "Ultimo mes" }
];

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
  const [movementUsers, setMovementUsers] = useState<MovementUserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const [productFilter, setProductFilter] = useState<string>("");
  const [movementRange, setMovementRange] = useState<MovementRange>("day");
  const [productLineFilter, setProductLineFilter] = useState<"all" | ProductLine>("all");
  const [idleProductsMetric, setIdleProductsMetric] = useState<IdleProductsMetric>("quantity");
  const [topProductsMetric, setTopProductsMetric] = useState<TopProductsMetric>("value");
  const [topProductsPeriod, setTopProductsPeriod] = useState<TopProductsPeriod>("week");
  const [waterfallRange, setWaterfallRange] = useState<WaterfallRange>("week");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userStartDate, setUserStartDate] = useState("");
  const [userEndDate, setUserEndDate] = useState("");
  const [activeTab, setActiveTab] = useState<DashboardTab>("stock");
  const autoSelectedUsersRef = useRef(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const bundle = await ensureFirebase();
        const { firestore } = bundle;
        const productsRef = firestore.collection(bundle.db, "products");
        const movementsRef = firestore.collection(bundle.db, "stockMovements");

        const [productsSnapshot, movementsSnapshot, usersList] = await Promise.all([
          firestore.getDocs(productsRef),
          firestore.getDocs(movementsRef),
          fetchMovementUsers().catch((userError) => {
            console.error("Falha ao carregar usuarios do dashboard", userError);
            return [] as MovementUserOption[];
          })
        ]);

        const loadedProducts: Product[] = productsSnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
        setProducts(loadedProducts);

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
        setMovementUsers(usersList);
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

  const baseProductMap = useMemo(() => {
    return new Map(filteredProducts.map((product) => [product.id, product]));
  }, [filteredProducts]);

  const filteredMovements = useMemo(() => {
    if (!categoryFilter && !supplierFilter && !productFilter) {
      return movements;
    }
    return movements.filter((movement) => baseProductMap.has(movement.productId));
  }, [movements, baseProductMap, categoryFilter, supplierFilter, productFilter]);

  const movementsWithProducts = useMemo(
    () =>
      filteredMovements
        .filter((movement) => movement.type === "out")
        .map((movement) => ({
          ...movement,
          product: baseProductMap.get(movement.productId)
        })),
    [filteredMovements, baseProductMap]
  );

  const productSalesAggregatesAll = useMemo<ProductSalesAggregate[]>(() => aggregateProductSales(movementsWithProducts), [movementsWithProducts]);

  const productLineAssignments = useMemo(() => {
    const lineMap = new Map<string, ProductLine>();
    if (!productSalesAggregatesAll.length) {
      products.forEach((product) => {
        if (product.id) {
          lineMap.set(product.id, "C");
        }
      });
      return lineMap;
    }

    const sorted = [...productSalesAggregatesAll].sort((a, b) => b.totalQuantity - a.totalQuantity);
    const totalQuantity = sorted.reduce((accumulator, item) => accumulator + item.totalQuantity, 0);

    if (totalQuantity <= 0) {
      products.forEach((product) => {
        if (product.id) {
          lineMap.set(product.id, "C");
        }
      });
      return lineMap;
    }

    let cumulative = 0;
    for (const aggregate of sorted) {
      cumulative += aggregate.totalQuantity;
      const ratio = cumulative / totalQuantity;
      let line: ProductLine = "C";
      if (ratio <= 0.8) {
        line = "A";
      } else if (ratio <= 0.95) {
        line = "B";
      }
      lineMap.set(aggregate.key, line);
      if (aggregate.productId) {
        lineMap.set(aggregate.productId, line);
      }
    }

    products.forEach((product) => {
      if (product.id && !lineMap.has(product.id)) {
        lineMap.set(product.id, "C");
      }
    });

    return lineMap;
  }, [productSalesAggregatesAll, products]);

  const visibleProducts = useMemo(() => {
    if (productLineFilter === "all") {
      return filteredProducts;
    }
    return filteredProducts.filter(
      (product) => (productLineAssignments.get(product.id) ?? "C") === productLineFilter
    );
  }, [filteredProducts, productLineFilter, productLineAssignments]);

  const productMap = useMemo(() => {
    return new Map(visibleProducts.map((product) => [product.id, product]));
  }, [visibleProducts]);

  const lineFilteredMovements = useMemo(() => {
    const map = productMap;
    if (productLineFilter === "all") {
      return movementsWithProducts.map((movement) => ({
        ...movement,
        product: map.get(movement.productId) ?? movement.product
      }));
    }
    return movementsWithProducts
      .filter((movement) => (productLineAssignments.get(resolveProductKey(movement)) ?? "C") === productLineFilter)
      .map((movement) => ({
        ...movement,
        product: map.get(movement.productId) ?? movement.product
      }));
  }, [movementsWithProducts, productLineAssignments, productLineFilter, productMap]);

  const productSalesAggregates = useMemo<ProductSalesAggregate[]>(() => aggregateProductSales(lineFilteredMovements), [lineFilteredMovements]);

  const userDirectory = useMemo(() => {
    const map = new Map<string, MovementUserOption>();
    for (const user of movementUsers) {
      map.set(user.id, user);
    }
    return map;
  }, [movementUsers]);

  useEffect(() => {
    if (!movementsWithProducts.length) {
      return;
    }

    if (selectedUserIds.length) {
      autoSelectedUsersRef.current = true;
      return;
    }

    if (autoSelectedUsersRef.current) {
      return;
    }

    const uniqueIds: string[] = [];
    for (const movement of movementsWithProducts) {
      if (!uniqueIds.includes(movement.userId)) {
        uniqueIds.push(movement.userId);
      }
    }

    if (uniqueIds.length) {
      setSelectedUserIds(uniqueIds.slice(0, 3));
      autoSelectedUsersRef.current = true;
    }
  }, [movementsWithProducts, selectedUserIds]);

  const userOptions = useMemo<DashboardUserOption[]>(() => {
    const map = new Map<string, DashboardUserOption>();

    for (const movement of movementsWithProducts) {
      if (!movement.userId) {
        continue;
      }

      const directoryUser = userDirectory.get(movement.userId);
      const rawName = directoryUser?.name ?? (typeof movement.userName === "string" ? movement.userName : "");
      const { name, tokens } = deriveUserDisplayName(rawName, movement.userId);
      const tokenSet = new Set(tokens);

      if (directoryUser?.email) {
        tokenSet.add(directoryUser.email.toLowerCase());
        const local = directoryUser.email.split("@")[0]?.toLowerCase();
        if (local) {
          tokenSet.add(local);
        }
      }
      if (directoryUser?.name) {
        tokenSet.add(directoryUser.name.toLowerCase());
      }
      if (typeof movement.userName === "string" && movement.userName.trim()) {
        tokenSet.add(movement.userName.trim().toLowerCase());
      }

      const existing = map.get(movement.userId);
      const mergedTokens = existing ? new Set(existing.searchTokens) : new Set<string>();
      for (const token of tokenSet) {
        mergedTokens.add(token);
      }

      let displayName = name;
      if (existing) {
        if (existing.name === "Usuario" && name !== "Usuario") {
          displayName = name;
        } else if (name === "Usuario") {
          displayName = existing.name;
        } else if (existing.name.length >= name.length) {
          displayName = existing.name;
        }
      }

      map.set(movement.userId, {
        id: movement.userId,
        name: displayName,
        searchTokens: Array.from(mergedTokens)
      });
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [movementsWithProducts, userDirectory]);

  const filteredUserOptions = useMemo(() => {
    if (!userSearch.trim()) {
      return userOptions;
    }
    const term = userSearch.trim().toLowerCase();
    return userOptions.filter((user) => user.searchTokens.some((token) => token.includes(term)));
  }, [userOptions, userSearch]);

  const selectedUsers = useMemo(() => {
    const selectedSet = new Set(selectedUserIds);
    return userOptions.filter((user) => selectedSet.has(user.id));
  }, [userOptions, selectedUserIds]);

  const userFilteredMovements = useMemo(() => {
    const start = userStartDate ? new Date(`${userStartDate}T00:00:00`).getTime() : null;
    const end = userEndDate ? new Date(`${userEndDate}T23:59:59.999`).getTime() : null;

    if (!start && !end) {
      return movementsWithProducts;
    }

    return movementsWithProducts.filter((movement) => {
      const ts = Number(movement.timestamp ?? 0);
      if (start && ts < start) {
        return false;
      }
      if (end && ts > end) {
        return false;
      }
      return true;
    });
  }, [movementsWithProducts, userStartDate, userEndDate]);

  const userStats = useMemo<UserActivitySummary[]>(() => {
    const summaries: UserActivitySummary[] = [];

    for (const user of selectedUsers) {
      const movementsForUser = userFilteredMovements.filter((movement) => movement.userId === user.id);

      if (!movementsForUser.length) {
        summaries.push({
          id: user.id,
          name: user.name,
          totalActions: 0,
          totalQuantity: 0,
          totalValue: 0,
          categories: [],
          topProducts: [],
          firstScan: null,
          lastScan: null
        });
        continue;
      }

      let totalQuantity = 0;
      let totalValue = 0;
      let firstScan: number | null = null;
      let lastScan: number | null = null;
      const categoryTotals = new Map<string, number>();
      const productTotals = new Map<string, { name: string; quantity: number }>();

      for (const movement of movementsForUser) {
        const movementQty = Math.abs(Number(movement.effectiveQty ?? movement.qty ?? 0));
        const unitPrice = movement.product?.unitPrice ?? 0;
        const categoryName = movement.product?.category ?? "Sem categoria";
        const productName = movement.product?.name ?? movement.product?.sku ?? movement.sku ?? "Produto";

        totalQuantity += movementQty;
        totalValue += movementQty * unitPrice;

        categoryTotals.set(categoryName, (categoryTotals.get(categoryName) ?? 0) + movementQty);

        if (movement.product) {
          const existing = productTotals.get(movement.product.id) ?? { name: productName, quantity: 0 };
          existing.quantity += movementQty;
          productTotals.set(movement.product.id, existing);
        } else {
          const fallbackKey = `${movement.sku}-${productName}`;
          const existing = productTotals.get(fallbackKey) ?? { name: productName, quantity: 0 };
          existing.quantity += movementQty;
          productTotals.set(fallbackKey, existing);
        }

        if (typeof movement.timestamp === "number" && Number.isFinite(movement.timestamp)) {
          if (!firstScan || movement.timestamp < firstScan) {
            firstScan = movement.timestamp;
          }
          if (!lastScan || movement.timestamp > lastScan) {
            lastScan = movement.timestamp;
          }
        }
      }

      const categories = Array.from(categoryTotals.entries())
        .map(([name, quantity]) => ({ name, quantity }))
        .sort((a, b) => b.quantity - a.quantity);

      const topProducts = Array.from(productTotals.entries())
        .map(([id, info]) => ({ id, name: info.name, quantity: info.quantity }))
        .sort((a, b) => b.quantity - a.quantity);

      summaries.push({
        id: user.id,
        name: user.name,
        totalActions: movementsForUser.length,
        totalQuantity,
        totalValue,
        categories,
        topProducts,
        firstScan,
        lastScan
      });
    }

    return summaries;
  }, [selectedUsers, userFilteredMovements]);
  const comparisonData = useMemo(
    () =>
      userStats
        .filter((summary) => summary.totalQuantity > 0)
        .map((summary) => ({
          user: summary.name,
          quantity: summary.totalQuantity,
          totalActions: summary.totalActions,
          totalValue: summary.totalValue
        })),
    [userStats]
  );

  const hasUserFilters = Boolean(userSearch.trim() || userStartDate || userEndDate || selectedUserIds.length);

  const formatUserDate = (timestamp: number | null) => {
    if (!timestamp) {
      return "Sem registros";
    }
    try {
      return format(new Date(timestamp), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch (error) {
      console.error("Falha ao formatar data de usuario", error);
      return "Sem registros";
    }
  };

  const totalItems = visibleProducts.reduce((acc, product) => acc + (product.quantity ?? 0), 0);
  const totalValue = visibleProducts.reduce((acc, product) => acc + (product.totalValue ?? 0), 0);

  const valueByCategory = visibleProducts.reduce<Record<string, number>>((acc, product) => {
    const key = product.category ?? "Sem categoria";
    acc[key] = (acc[key] ?? 0) + (product.totalValue ?? 0);
    return acc;
  }, {});

  const valueBySupplier = visibleProducts.reduce<Record<string, number>>((acc, product) => {
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

  const windowStats = (start: number) => {
    const relevant = lineFilteredMovements.filter((movement) => movement.timestamp >= start);
    const totalQty = relevant.reduce(
      (acc, movement) => acc + Math.abs(Number(movement.effectiveQty ?? movement.qty ?? 0)),
      0
    );
    const totalVal = relevant.reduce((acc, movement) => {
      const unitPrice = movement.product?.unitPrice ?? 0;
      const quantity = Math.abs(Number(movement.effectiveQty ?? movement.qty ?? 0));
      return acc + unitPrice * quantity;
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

      for (const movement of lineFilteredMovements) {
        if (movement.timestamp >= start && movement.timestamp < end) {
          const quantity = Math.abs(Number(movement.effectiveQty ?? movement.qty ?? 0));
          const unitPrice = movement.product?.unitPrice ?? 0;
          totalQty += quantity;
          totalVal += unitPrice * quantity;
        }
      }

      return {
        label,
        date: date.toISOString(),
        value: totalVal,
        quantity: totalQty
      };
    });
  }, [lineFilteredMovements, movementRange]);

  const categoryDonutData = useMemo(
    () =>
      Object.entries(valueByCategory)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
    [valueByCategory]
  );

  const supplierDonutData = useMemo(() => {
    const entries = Object.entries(valueBySupplier)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    if (entries.length <= SUPPLIER_DONUT_MAX_SLICES) {
      return entries;
    }

    const limit = Math.max(SUPPLIER_DONUT_MAX_SLICES - 1, 1);
    const topSuppliers = entries.slice(0, limit);
    const remaining = entries.slice(limit);
    const othersTotal = remaining.reduce((accumulator, item) => accumulator + item.value, 0);

    if (othersTotal <= 0) {
      return topSuppliers;
    }

    return [
      ...topSuppliers,
      {
        name: `Outros (+${remaining.length})`,
        value: othersTotal
      }
    ];
  }, [valueBySupplier]);

  const idleProductsData = useMemo<ProductsBarDatum[]>(() => {
    if (!visibleProducts.length) {
      return [];
    }

    const aggregateByProductId = new Map<string, ProductSalesAggregate>();
    for (const aggregate of productSalesAggregates) {
      const id = aggregate.productId ?? aggregate.key;
      if (id) {
        aggregateByProductId.set(id, aggregate);
      }
    }

    const dataset: ProductsBarDatum[] = [];

    visibleProducts.forEach((product) => {
      const productId = product.id ?? "";
      const aggregate = productId ? aggregateByProductId.get(productId) : undefined;
      const totalQuantityDispatched = aggregate?.totalQuantity ?? 0;

      if (totalQuantityDispatched > 0) {
        return;
      }

      const stockQuantity = Number(product.quantity ?? 0);
      const stockValue = Number(
        product.totalValue ??
          (Number(product.quantity ?? 0) * Number(product.unitPrice ?? 0))
      );

      const metricValue = idleProductsMetric === "value" ? stockValue : stockQuantity;
      const helper =
        idleProductsMetric === "value"
          ? `${stockQuantity.toLocaleString("pt-BR")} un`
          : currency(stockValue);

      const displayName = product.name ?? product.sku ?? (productId || "Produto");

      dataset.push({
        name: displayName,
        value: Number(metricValue) || 0,
        helper
      });
    });

    return dataset
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);
  }, [visibleProducts, productSalesAggregates, idleProductsMetric]);

  const topProductsData = useMemo<ProductsBarDatum[]>(() => {
    if (!lineFilteredMovements.length) {
      return [];
    }

    const reference = new Date();
    const periodStart =
      topProductsPeriod === "day"
        ? startOfDay(reference).getTime()
        : topProductsPeriod === "week"
          ? startOfWeek(reference).getTime()
          : startOfMonth(reference).getTime();

    const relevant = lineFilteredMovements.filter((movement) => movement.timestamp >= periodStart);
    const aggregates = aggregateProductSales(relevant);

    return aggregates
      .map((aggregate) => {
        const { totalValue, totalQuantity, saleCount, name } = aggregate;
        let metricValue = totalValue;
        let helper = `${totalQuantity.toLocaleString("pt-BR")} un`;

        if (topProductsMetric === "quantity") {
          metricValue = totalQuantity;
          helper = currency(totalValue);
        } else if (topProductsMetric === "sales") {
          metricValue = saleCount;
          helper = `${totalQuantity.toLocaleString("pt-BR")} un`;
        }

        return {
          name,
          value: Number(metricValue) || 0,
          helper
        };
      })
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);
  }, [lineFilteredMovements, topProductsMetric, topProductsPeriod]);

  const topProductsValueFormatter = useMemo(() => {
    if (topProductsMetric === "value") {
      return currency;
    }
    if (topProductsMetric === "sales") {
      return (value: number) => `${value.toLocaleString("pt-BR")} mov.`;
    }
    return (value: number) => value.toLocaleString("pt-BR");
  }, [topProductsMetric]);

  const idleProductsValueFormatter = useMemo(() => {
    return idleProductsMetric === "value" ? currency : (value: number) => value.toLocaleString("pt-BR");
  }, [idleProductsMetric]);

  const stockValueSeries = useMemo(() => {
    const reference = new Date();
    const days = waterfallRange === "week" ? 7 : 30;
    const segments: Array<{
      label: string;
      start: number;
      end: number;
      date: Date;
      shippedValue: number;
    }> = [];

    for (let index = days - 1; index >= 0; index -= 1) {
      const day = startOfDay(subDays(reference, index));
      segments.push({
        label: format(day, "dd/MM", { locale: ptBR }),
        start: day.getTime(),
        end: addDays(day, 1).getTime(),
        date: day,
        shippedValue: 0
      });
    }

    if (!segments.length) {
      return [];
    }

    for (const movement of lineFilteredMovements) {
      if (typeof movement.timestamp !== "number") {
        continue;
      }
      for (const segment of segments) {
        if (movement.timestamp >= segment.start && movement.timestamp < segment.end) {
          const quantity = Math.abs(Number(movement.effectiveQty ?? movement.qty ?? 0));
          const unitPrice = movement.product?.unitPrice ?? 0;
          segment.shippedValue += quantity * unitPrice;
          break;
        }
      }
    }

    const totalReduction = segments.reduce((accumulator, segment) => accumulator + segment.shippedValue, 0);
    const startValue = totalValue + totalReduction;

    let running = startValue;
    const series: Array<{ label: string; date: string; value: number }> = [
      {
        label: "Inicio",
        date: subDays(segments[0].date, 1).toISOString(),
        value: Math.max(startValue, 0)
      }
    ];

    segments.forEach((segment) => {
      running -= segment.shippedValue;
      series.push({
        label: segment.label,
        date: segment.date.toISOString(),
        value: Math.max(running, 0)
      });
    });

    return series;
  }, [lineFilteredMovements, waterfallRange, totalValue]);

  const movementRangeLabel = MOVEMENT_RANGE_OPTIONS.find((option) => option.value === movementRange)?.label ?? "";
  const hasStockFilters =
    Boolean(categoryFilter || supplierFilter || productFilter || productLineFilter !== "all") ||
    movementRange !== "day";
  const hasCurrentTabFilters = activeTab === "stock" ? hasStockFilters : hasUserFilters;
  const tabCopy =
    activeTab === "stock"
      ? {
          title: "Dashboard de Estoque",
          description: "Visao geral do estoque atual, valor em prateleira e historico de saidas."
        }
      : {
          title: "Dashboard de Usuarios",
          description: "Acompanhe a atividade da equipe, compare saidas e identifique destaques."
        };

  const clearStockFilters = () => {
    setCategoryFilter("");
    setSupplierFilter("");
    setProductFilter("");
    setMovementRange("day");
    setProductLineFilter("all");
  };

  const handleClearFilters = () => {
    if (activeTab === "stock") {
      clearStockFilters();
    } else {
      handleClearUserFilters(false);
    }
  };

  const handleToggleUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((id) => id !== userId);
      }
      return [...prev, userId];
    });
  };

  const handleClearUserFilters = (preventAutoSelection = false) => {
    autoSelectedUsersRef.current = preventAutoSelection ? true : false;
    setSelectedUserIds([]);
    setUserSearch("");
    setUserStartDate("");
    setUserEndDate("");
  };
  return (
    <div className="space-y-8">
      <header>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{tabCopy.title}</h1>
              <p className="text-sm text-slate-500">{tabCopy.description}</p>
            </div>
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
              <div className="inline-flex rounded-full bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("stock")}
                  className={`rounded-full px-4 py-1 text-sm font-semibold transition ${
                    activeTab === "stock"
                      ? "bg-white text-slate-900 shadow"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Estoque
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("users")}
                  className={`rounded-full px-4 py-1 text-sm font-semibold transition ${
                    activeTab === "users"
                      ? "bg-white text-slate-900 shadow"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Usuarios
                </button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start rounded-lg px-3 text-sm font-semibold text-slate-600 hover:text-slate-900"
                onClick={handleClearFilters}
                disabled={!hasCurrentTabFilters}
              >
                Limpar filtros
              </Button>
            </div>
          </div>
          {activeTab === "stock" ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-1">
                <Label
                  htmlFor="dashboard-category"
                  className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Categoria
                </Label>
                <Select
                  id="dashboard-category"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="min-w-[200px]"
                >
                  <option value="">Todas as categorias</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="dashboard-supplier"
                  className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Fornecedor
                </Label>
                <Select
                  id="dashboard-supplier"
                  value={supplierFilter}
                  onChange={(event) => setSupplierFilter(event.target.value)}
                  className="min-w-[200px]"
                >
                  <option value="">Todos os fornecedores</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier} value={supplier}>
                      {supplier}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="dashboard-product"
                  className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Produto
                </Label>
                <Select
                  id="dashboard-product"
                  value={productFilter}
                  onChange={(event) => setProductFilter(event.target.value)}
                  className="min-w-[200px]"
                >
                  <option value="">Todos os produtos</option>
                  {productOptions.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.sku})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="dashboard-line"
                  className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Linha
                </Label>
                <Select
                  id="dashboard-line"
                  value={productLineFilter}
                  onChange={(event) => setProductLineFilter(event.target.value as "all" | ProductLine)}
                  className="min-w-[200px]"
                >
                  {PRODUCT_LINE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="dashboard-range"
                  className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Periodo
                </Label>
                <Select
                  id="dashboard-range"
                  value={movementRange}
                  onChange={(event) => setMovementRange(event.target.value as MovementRange)}
                  className="min-w-[200px]"
                >
                  {MOVEMENT_RANGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center text-slate-500">Carregando metricas...</div>
      ) : activeTab === "stock" ? (
        <>
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
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatsCard label="Itens em estoque" value={totalItems.toLocaleString("pt-BR")} />
            <StatsCard label="Valor em estoque" value={currency(totalValue)} />
            <StatsCard label="Saidas hoje" value={`${todayStats.totalQty} itens`} description={currency(todayStats.totalVal)} />
            <StatsCard label="Saidas na semana" value={`${weekStats.totalQty} itens`} description={currency(weekStats.totalVal)} />
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-[3fr,2fr]">
            <StatsCard label="Saidas no mes" value={`${monthStats.totalQty} itens`} description={currency(monthStats.totalVal)} />
            <StatsCard label="Saidas no ano" value={`${yearStats.totalQty} itens`} description={currency(yearStats.totalVal)} />
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
            <ProductsBarChart
              className="md:col-span-2 xl:col-span-3"
              data={topProductsData}
              title="Produtos com mais saida"
              valueFormatter={topProductsValueFormatter}
              chartHeight="h-[26rem]"
              xTickAngle={-35}
              emptyMessage="Sem saidas no periodo selecionado."
              headerActions={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select
                    value={topProductsMetric}
                    onChange={(event) => setTopProductsMetric(event.target.value as TopProductsMetric)}
                    className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium uppercase tracking-wide text-slate-600 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  >
                    {TOP_PRODUCTS_METRIC_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={topProductsPeriod}
                    onChange={(event) => setTopProductsPeriod(event.target.value as TopProductsPeriod)}
                    className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium uppercase tracking-wide text-slate-600 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  >
                    {TOP_PRODUCTS_PERIOD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
              }
            />
          </section>
          <section className="grid gap-4 xl:grid-cols-[3fr,2fr]">
            <ProductsBarChart
              className="xl:col-span-2"
              data={idleProductsData}
              title="Produtos mais parados"
              valueFormatter={idleProductsValueFormatter}
              chartHeight="h-[28rem]"
              xTickAngle={-35}
              emptyMessage="Nenhum produto elegivel para este filtro."
              headerActions={
                <Select
                  value={idleProductsMetric}
                  onChange={(event) => setIdleProductsMetric(event.target.value as IdleProductsMetric)}
                  className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium uppercase tracking-wide text-slate-600 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  {IDLE_METRIC_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              }
            />
            <LineTimeseries
              data={stockValueSeries}
              title="Valor do estoque"
              valueFormatter={currency}
              emptyMessage="Sem movimentacoes no periodo selecionado."
              headerActions={
                <Select
                  value={waterfallRange}
                  onChange={(event) => setWaterfallRange(event.target.value as WaterfallRange)}
                  className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium uppercase tracking-wide text-slate-600 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  {WATERFALL_RANGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              }
            />
          </section>
        </>
      ) : (
        <>
          {userOptions.length ? (
            <section className="grid gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Atividade por usuario</h2>
                    <p className="text-sm text-slate-500">
                      Pesquise usuarios para ver quantas saidas foram bipadas, categorias mais frequentes e produtos
                      destacados no periodo escolhido.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start rounded-lg px-3 text-sm"
                    onClick={() => handleClearUserFilters(true)}
                    disabled={!hasUserFilters}
                  >
                    Limpar selecao
                  </Button>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-[2fr,1fr]">
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label
                          htmlFor="dashboard-user-search"
                          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                        >
                          Buscar usuario
                        </Label>
                        <Input
                          id="dashboard-user-search"
                          placeholder="Nome ou ID"
                          value={userSearch}
                          onChange={(event) => setUserSearch(event.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label
                            htmlFor="dashboard-user-start"
                            className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                          >
                            Data inicial
                          </Label>
                          <Input
                            id="dashboard-user-start"
                            type="date"
                            value={userStartDate}
                            onChange={(event) => setUserStartDate(event.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label
                            htmlFor="dashboard-user-end"
                            className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                          >
                            Data final
                          </Label>
                          <Input
                            id="dashboard-user-end"
                            type="date"
                            value={userEndDate}
                            min={userStartDate || undefined}
                            onChange={(event) => setUserEndDate(event.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Usuarios selecionados</p>
                      {selectedUsers.length ? (
                        <div className="flex flex-wrap gap-2">
                          {selectedUsers.map((user) => (
                            <span
                              key={user.id}
                              className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
                            >
                              <span className="font-medium">{user.name}</span>
                              <button
                                type="button"
                                className="text-xs font-semibold text-slate-500 transition hover:text-slate-900"
                                onClick={() => handleToggleUser(user.id)}
                              >
                                remover
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">Escolha um ou mais usuarios na lista ao lado.</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Usuarios disponiveis</p>
                    <div className="grid max-h-48 gap-2 overflow-y-auto pr-1">
                      {filteredUserOptions.map((user) => {
                        const active = selectedUserIds.includes(user.id);
                        return (
                          <Button
                            key={user.id}
                            type="button"
                            variant="outline"
                            className={`justify-start text-left ${
                              active ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-900" : ""
                            }`}
                            onClick={() => handleToggleUser(user.id)}
                            title={user.name}
                          >
                            <span className="text-sm font-semibold text-current">{user.name}</span>
                          </Button>
                        );
                      })}
                      {!filteredUserOptions.length ? (
                        <p className="text-sm text-slate-500">Nenhum usuario encontrado.</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              {comparisonData.length ? (
                <UserComparisonChart data={comparisonData} title="Comparativo de saidas por usuario" />
              ) : null}
              {selectedUsers.length ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {userStats.map((summary) => {
                    const topCategories = summary.categories.slice(0, 3);
                    const topProducts = summary.topProducts.slice(0, 3);
                    const hasActivity = summary.totalActions > 0;

                    return (
                      <div
                        key={summary.id}
                        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-500">Usuario</p>
                            <h3 className="text-lg font-semibold text-slate-900">{summary.name}</h3>
                            <p className="text-xs text-slate-500">
                              {summary.totalActions.toLocaleString("pt-BR")} movimentacoes registradas
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Quantidade</p>
                            <p className="text-2xl font-bold text-slate-900">
                              {summary.totalQuantity.toLocaleString("pt-BR")}
                            </p>
                          </div>
                        </div>

                        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-slate-500">Valor movimentado</dt>
                            <dd className="font-semibold text-slate-900">{currency(summary.totalValue)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-slate-500">Ultima saida</dt>
                            <dd className="font-semibold text-slate-900">{formatUserDate(summary.lastScan)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-slate-500">Primeira saida</dt>
                            <dd className="font-semibold text-slate-900">{formatUserDate(summary.firstScan)}</dd>
                          </div>
                        </dl>

                        {hasActivity ? (
                          <div className="mt-4 space-y-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Categorias principais
                              </p>
                              <ul className="mt-2 space-y-1 text-sm">
                                {topCategories.map((category) => (
                                  <li
                                    key={`${summary.id}-${category.name}`}
                                    className="flex items-center justify-between text-slate-600"
                                  >
                                    <span>{category.name}</span>
                                    <span className="font-semibold text-slate-900">
                                      {category.quantity.toLocaleString("pt-BR")} itens
                                    </span>
                                  </li>
                                ))}
                                {!topCategories.length ? (
                                  <li className="text-sm text-slate-500">Sem categorias para este periodo.</li>
                                ) : null}
                              </ul>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Produtos mais bipados
                              </p>
                              <ul className="mt-2 space-y-1 text-sm">
                                {topProducts.map((product) => (
                                  <li
                                    key={`${summary.id}-${product.id}`}
                                    className="flex items-center justify-between text-slate-600"
                                  >
                                    <span className="truncate pr-2">{product.name}</span>
                                    <span className="font-semibold text-slate-900">
                                      {product.quantity.toLocaleString("pt-BR")} itens
                                    </span>
                                  </li>
                                ))}
                                {!topProducts.length ? (
                                  <li className="text-sm text-slate-500">Sem produtos destacados no periodo.</li>
                                ) : null}
                              </ul>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-4 text-sm text-slate-500">
                            Sem movimentacoes para este usuario no periodo selecionado.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          ) : (
            <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
              Nenhum usuario com movimentacoes para exibir.
            </div>
          )}
        </>
      )}
    </div>
  );
}





