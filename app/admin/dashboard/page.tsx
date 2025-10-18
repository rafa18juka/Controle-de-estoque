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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { toast } from "sonner";

import dynamic from "next/dynamic";

import { ProtectedRoute } from "@/components/protected-route";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { RoleGate } from "@/components/role-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { StatsCard } from "@/components/stats-card";
import { ensureFirebase } from "@/lib/firebase-client";
import { fetchMovementUsers, type MovementUserOption } from "@/lib/firestore";
import type { Product, StockMovement, TrackingCodeRecord } from "@/lib/types";
import { currency, formatDay } from "@/lib/format";
import type { ProductsBarDatum } from "@/components/charts/products-bar";
import type { ComparisonPoint, ComparisonSeriesKey } from "@/components/charts/comparison-area";
import type { DailyColumnPoint } from "@/components/charts/daily-columns";
import type { CosmicDonutDatum } from "@/components/charts/cosmic-donut-panel";

type DashboardTab = "stock" | "users";
type ProductLine = "A" | "B" | "C";
type IdleProductsMetric = "quantity" | "value";
type TopProductsMetric = "value" | "quantity" | "sales";
type TopProductsPeriod = "day" | "week" | "month";
type WaterfallRange = "week" | "month";
type UserMetric = "quantity" | "actions";

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

interface ProductGroupDetail {
  value: CosmicDonutDatum[];
  quantity: CosmicDonutDatum[];
}

function buildProductGroupDetails(
  products: Product[],
  aggregates: ProductSalesAggregate[],
  keySelector: (product: Product) => string,
  limit = 8
): Map<string, ProductGroupDetail> {
  const aggregateByProductId = new Map<string, ProductSalesAggregate>();
  for (const aggregate of aggregates) {
    const id = aggregate.productId ?? aggregate.key;
    if (id) {
      aggregateByProductId.set(id, aggregate);
    }
  }

  const details = new Map<string, ProductGroupDetail>();

  products.forEach((product) => {
    const groupKey = keySelector(product);
    const aggregate = product.id ? aggregateByProductId.get(product.id) : undefined;
    const fallbackQuantity = Number(product.quantity ?? 0);
    const fallbackValue = Number(product.totalValue ?? fallbackQuantity * Number(product.unitPrice ?? 0));
    const totalValue = Number(aggregate?.totalValue ?? fallbackValue);
    const totalQuantity = Number(aggregate?.totalQuantity ?? fallbackQuantity);

    if (totalValue <= 0 && totalQuantity <= 0) {
      return;
    }

    const productLabel = product.name?.trim() || product.sku || "Produto";
    const helperForValue = totalQuantity > 0 ? formatUnits(totalQuantity) : undefined;
    const helperForQuantity = totalValue > 0 ? currency(totalValue) : undefined;
    const current = details.get(groupKey) ?? { value: [], quantity: [] };

    if (totalValue > 0) {
      current.value.push({
        name: productLabel,
        value: totalValue,
        helper: helperForValue
      });
    }

    if (totalQuantity > 0) {
      current.quantity.push({
        name: productLabel,
        value: totalQuantity,
        helper: helperForQuantity
      });
    }

    details.set(groupKey, current);
  });

  const decorate = (
    items: CosmicDonutDatum[],
    helperBuilder?: (total: number, count: number) => string | undefined
  ) => {
    if (!items.length) {
      return [];
    }

    const sorted = [...items].sort((a, b) => b.value - a.value);
    if (sorted.length > limit) {
      const top = sorted.slice(0, limit - 1);
      const others = sorted.slice(limit - 1);
      const othersValue = others.reduce((accumulator, item) => accumulator + item.value, 0);
      if (othersValue > 0) {
        top.push({
          name: `Outros (+${others.length})`,
          value: othersValue,
          helper: helperBuilder?.(othersValue, others.length)
        });
      }
      return top.map((item, index) => ({
        ...item,
        color: COSMIC_DONUT_COLORS[index % COSMIC_DONUT_COLORS.length]
      }));
    }

    return sorted.map((item, index) => ({
      ...item,
      color: COSMIC_DONUT_COLORS[index % COSMIC_DONUT_COLORS.length]
    }));
  };

  for (const [groupKey, detail] of details.entries()) {
    const valueDecorated = decorate(detail.value, (_, count) => `${count} produtos`);
    const quantityDecorated = decorate(detail.quantity, (total) => formatUnits(total));
    details.set(groupKey, {
      value: valueDecorated,
      quantity: quantityDecorated
    });
  }

  return details;
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

const ComparisonAreaChart = dynamic(
  () => import("@/components/charts/comparison-area").then((mod) => mod.ComparisonAreaChart),
  { ssr: false }
);
const DailyColumnsChart = dynamic(
  () => import("@/components/charts/daily-columns").then((mod) => mod.DailyColumnsChart),
  { ssr: false }
);
const CosmicDonutPanel = dynamic(
  () => import("@/components/charts/cosmic-donut-panel").then((mod) => mod.CosmicDonutPanel),
  { ssr: false }
);
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
const COSMIC_DONUT_COLORS = [
  "#22d3ee",
  "#a855f7",
  "#38bdf8",
  "#6366f1",
  "#f59e0b",
  "#f97316",
  "#ec4899",
  "#10b981",
  "#f43f5e",
  "#14b8a6"
];

function formatUnits(value: number) {
  return `${value.toLocaleString("pt-BR")} un`;
}

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

const DEFAULT_COMPARISON_KEYS: ComparisonSeriesKey[] = ["week", "month", "year"];
const COMPARISON_OPTIONS: Array<{ key: ComparisonSeriesKey; label: string }> = [
  { key: "week", label: "Semanal" },
  { key: "month", label: "Mensal" },
  { key: "year", label: "Anual" }
];
const COMPARISON_KEY_ORDER = COMPARISON_OPTIONS.map((option) => option.key);
const COMPARISON_WINDOW_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 6, label: "6 pontos" },
  { value: 9, label: "9 pontos" },
  { value: 12, label: "12 pontos" }
];
const DEFAULT_COMPARISON_WINDOW = 12;
const DAILY_WINDOW_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 7, label: "7 dias" },
  { value: 14, label: "14 dias" },
  { value: 30, label: "30 dias" }
];
const DEFAULT_DAILY_WINDOW = 30;
const MAX_DAILY_POINTS = 60;

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

type UserCardStyle = {
  gradient: string;
  border: string;
  metric: string;
  pill: string;
  conicGradient: string;
  glowGradient: string;
};

const USER_CARD_STYLES: UserCardStyle[] = [
  {
    gradient: "from-sky-500 via-cyan-500 to-emerald-500",
    border: "border-cyan-200",
    metric: "text-cyan-600",
    pill: "bg-cyan-100 text-cyan-700",
    conicGradient: "conic-gradient(from 0deg at 50% 50%, #0ea5e9, #06b6d4, #34d399, #0ea5e9)",
    glowGradient: "linear-gradient(135deg, rgba(14, 165, 233, 0.35), rgba(20, 184, 166, 0.35))"
  },
  {
    gradient: "from-amber-500 via-orange-500 to-rose-500",
    border: "border-amber-200",
    metric: "text-amber-600",
    pill: "bg-amber-100 text-amber-700",
    conicGradient: "conic-gradient(from 0deg at 50% 50%, #f97316, #f59e0b, #f43f5e, #f97316)",
    glowGradient: "linear-gradient(135deg, rgba(251, 191, 36, 0.35), rgba(244, 63, 94, 0.35))"
  },
  {
    gradient: "from-violet-500 via-purple-500 to-fuchsia-500",
    border: "border-fuchsia-200",
    metric: "text-purple-600",
    pill: "bg-purple-100 text-purple-700",
    conicGradient: "conic-gradient(from 0deg at 50% 50%, #a855f7, #8b5cf6, #ec4899, #a855f7)",
    glowGradient: "linear-gradient(135deg, rgba(168, 85, 247, 0.38), rgba(236, 72, 153, 0.35))"
  },
  {
    gradient: "from-emerald-500 via-teal-500 to-lime-500",
    border: "border-emerald-200",
    metric: "text-emerald-600",
    pill: "bg-emerald-100 text-emerald-700",
    conicGradient: "conic-gradient(from 0deg at 50% 50%, #34d399, #10b981, #84cc16, #34d399)",
    glowGradient: "linear-gradient(135deg, rgba(52, 211, 153, 0.3), rgba(132, 204, 22, 0.35))"
  }
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
  const [trackingCodes, setTrackingCodes] = useState<TrackingCodeRecord[]>([]);
  const [movementUsers, setMovementUsers] = useState<MovementUserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const [productFilter, setProductFilter] = useState<string>("");
  const [activeComparisonKeys, setActiveComparisonKeys] = useState<ComparisonSeriesKey[]>(() => [...DEFAULT_COMPARISON_KEYS]);
  const [productLineFilter, setProductLineFilter] = useState<"all" | ProductLine>("all");
  const [idleProductsMetric, setIdleProductsMetric] = useState<IdleProductsMetric>("quantity");
  const [topProductsMetric, setTopProductsMetric] = useState<TopProductsMetric>("value");
  const [topProductsPeriod, setTopProductsPeriod] = useState<TopProductsPeriod>("week");
  const [waterfallRange, setWaterfallRange] = useState<WaterfallRange>("week");
  const [comparisonWindow, setComparisonWindow] = useState<number>(DEFAULT_COMPARISON_WINDOW);
  const [dailyWindow, setDailyWindow] = useState<number>(DEFAULT_DAILY_WINDOW);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userStartDate, setUserStartDate] = useState("");
  const [userEndDate, setUserEndDate] = useState("");
  const [userMetric, setUserMetric] = useState<UserMetric>("quantity");
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
        const trackingRef = firestore.collection(bundle.db, "trackingCodes");

        const [productsSnapshot, movementsSnapshot, trackingSnapshot, usersList] = await Promise.all([
          firestore.getDocs(productsRef),
          firestore.getDocs(movementsRef),
          firestore
            .getDocs(trackingRef)
            .catch((trackingError: unknown) => {
              console.error("Falha ao carregar rastreios do dashboard", trackingError);
              return { docs: [] } as any;
            }),
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

        const trackingDocs = Array.isArray((trackingSnapshot as any)?.docs) ? (trackingSnapshot as any).docs : [];
        const loadedTracking: TrackingCodeRecord[] = trackingDocs.map((doc: any) => {
          const data = doc.data ? doc.data() : {};
          const createdAtValue =
            data.createdAt && typeof data.createdAt.toMillis === "function"
              ? data.createdAt.toMillis()
              : Number(data.createdAt ?? 0);
          return {
            id: doc.id,
            code: typeof data.code === "string" ? data.code : "",
            userId: typeof data.userId === "string" ? data.userId : "",
            userName: typeof data.userName === "string" ? data.userName : "",
            createdAt: createdAtValue,
            productSku: typeof data.productSku === "string" && data.productSku.length ? data.productSku : undefined,
            productName: typeof data.productName === "string" && data.productName.length ? data.productName : undefined,
            stockMovementId:
              typeof data.stockMovementId === "string" && data.stockMovementId.length
                ? data.stockMovementId
                : undefined
          };
        });
        setTrackingCodes(loadedTracking);
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

  const userFilteredTrackings = useMemo(() => {
    const start = userStartDate ? new Date(`${userStartDate}T00:00:00`).getTime() : null;
    const end = userEndDate ? new Date(`${userEndDate}T23:59:59.999`).getTime() : null;

    if (!start && !end) {
      return trackingCodes;
    }

    return trackingCodes.filter((tracking) => {
      const ts = Number(tracking.createdAt ?? 0);
      if (start && ts < start) {
        return false;
      }
      if (end && ts > end) {
        return false;
      }
      return true;
    });
  }, [trackingCodes, userStartDate, userEndDate]);

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
    return userOptions;
  }, [userOptions]);

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
      const trackingsForUser = userFilteredTrackings.filter((tracking) => tracking.userId === user.id);

      if (!movementsForUser.length && !trackingsForUser.length) {
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

      if (trackingsForUser.length) {
        for (const tracking of trackingsForUser) {
          const ts = Number(tracking.createdAt ?? 0);
          if (!ts) {
            continue;
          }
          if (!firstScan || ts < firstScan) {
            firstScan = ts;
          }
          if (!lastScan || ts > lastScan) {
            lastScan = ts;
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
        totalActions: trackingsForUser.length,
        totalQuantity,
        totalValue,
        categories,
        topProducts,
        firstScan,
        lastScan
      });
    }

    return summaries;
  }, [selectedUsers, userFilteredMovements, userFilteredTrackings]);
  const comparisonData = useMemo(() => {
    const secondaryLabel = userMetric === "quantity" ? "movimentacoes gerais" : "itens embalados";
    return userStats
      .filter((summary) => {
        const primary = userMetric === "quantity" ? summary.totalQuantity : summary.totalActions;
        return primary > 0;
      })
      .map((summary) => {
        const primary = userMetric === "quantity" ? summary.totalQuantity : summary.totalActions;
        const secondary = userMetric === "quantity" ? summary.totalActions : summary.totalQuantity;
        return {
          user: summary.name,
          quantity: primary,
          secondaryValue: secondary,
          secondaryLabel,
          totalValue: summary.totalValue
        };
      });
  }, [userStats, userMetric]);
  const comparisonTitle =
    userMetric === "quantity"
      ? "Comparativo de itens embalados por usuario"
      : "Comparativo de movimentacoes por usuario";
  const comparisonValueLabel = userMetric === "quantity" ? "itens embalados" : "movimentacoes";

  const hasUserFilters = Boolean(userStartDate || userEndDate || selectedUserIds.length || userMetric !== "quantity");

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

  const comparisonSeries = useMemo<ComparisonPoint[]>(() => {
    const reference = new Date();

    const buildSegments = (mode: ComparisonSeriesKey, count: number) => {
      const ranges: Array<{ label: string; description: string; start: number; end: number }> = [];

      for (let index = count - 1; index >= 0; index -= 1) {
        if (mode === "week") {
          const weekStart = startOfWeek(subWeeks(reference, index));
          const weekEnd = addWeeks(weekStart, 1);
          ranges.push({
            label: format(weekStart, "dd/MM", { locale: ptBR }),
            description: `${format(weekStart, "dd MMM", { locale: ptBR })} - ${format(subDays(weekEnd, 1), "dd MMM", { locale: ptBR })}`,
            start: weekStart.getTime(),
            end: weekEnd.getTime()
          });
        } else if (mode === "month") {
          const monthStart = startOfMonth(subMonths(reference, index));
          const monthEnd = addMonths(monthStart, 1);
          ranges.push({
            label: format(monthStart, "MMM/yy", { locale: ptBR }),
            description: format(monthStart, "MMMM yyyy", { locale: ptBR }),
            start: monthStart.getTime(),
            end: monthEnd.getTime()
          });
        } else {
          const yearStart = startOfYear(subYears(reference, index));
          const yearEnd = addYears(yearStart, 1);
          ranges.push({
            label: format(yearStart, "yyyy", { locale: ptBR }),
            description: `Ano de ${format(yearStart, "yyyy", { locale: ptBR })}`,
            start: yearStart.getTime(),
            end: yearEnd.getTime()
          });
        }
      }

      return ranges.map(({ label, description, start, end }) => {
        let totalQty = 0;
        let totalVal = 0;

        for (const movement of lineFilteredMovements) {
          if (movement.timestamp >= start && movement.timestamp < end) {
            const quantity = Math.abs(Number(movement.effectiveQty ?? movement.qty ?? 0));
            const unitPrice = Number(movement.product?.unitPrice ?? 0);
            totalQty += quantity;
            totalVal += unitPrice * quantity;
          }
        }

        return {
          label,
          description,
          quantity: totalQty,
          value: totalVal
        };
      });
    };

    const weeklySegments = buildSegments("week", 12);
    const monthlySegments = buildSegments("month", 12);
    const yearlySegments = buildSegments("year", 12);

    const maxLength = Math.max(weeklySegments.length, monthlySegments.length, yearlySegments.length);
    const weekOffset = maxLength - weeklySegments.length;
    const monthOffset = maxLength - monthlySegments.length;
    const yearOffset = maxLength - yearlySegments.length;

    const dataset: ComparisonPoint[] = [];

    for (let index = 0; index < maxLength; index += 1) {
      const weekEntry = index >= weekOffset ? weeklySegments[index - weekOffset] : undefined;
      const monthEntry = index >= monthOffset ? monthlySegments[index - monthOffset] : undefined;
      const yearEntry = index >= yearOffset ? yearlySegments[index - yearOffset] : undefined;

      const axisLabel = monthEntry?.label ?? weekEntry?.label ?? yearEntry?.label ?? `P${index + 1}`;

      dataset.push({
        name: axisLabel,
        weekValue: weekEntry ? weekEntry.value : null,
        weekQuantity: weekEntry ? weekEntry.quantity : null,
        weekLabel: weekEntry?.description ?? null,
        monthValue: monthEntry ? monthEntry.value : null,
        monthQuantity: monthEntry ? monthEntry.quantity : null,
        monthLabel: monthEntry?.description ?? null,
        yearValue: yearEntry ? yearEntry.value : null,
        yearQuantity: yearEntry ? yearEntry.quantity : null,
        yearLabel: yearEntry?.description ?? null
      });
    }

    return dataset;
  }, [lineFilteredMovements]);

  const toggleComparisonKey = (key: ComparisonSeriesKey) => {
    setActiveComparisonKeys((previous) => {
      if (previous.includes(key)) {
        if (previous.length === 1) {
          return previous;
        }
        return previous.filter((item) => item !== key);
      }
      const next = [...previous, key];
      next.sort(
        (a, b) => COMPARISON_KEY_ORDER.indexOf(a) - COMPARISON_KEY_ORDER.indexOf(b)
      );
      return next;
    });
  };

  const comparisonSeriesView = useMemo(() => {
    if (comparisonWindow <= 0) {
      return comparisonSeries;
    }
    return comparisonSeries.slice(-comparisonWindow);
  }, [comparisonSeries, comparisonWindow]);

  const dailyColumnsSeries = useMemo<DailyColumnPoint[]>(() => {
    const reference = new Date();
    const segments: Array<{ name: string; start: number; end: number; label: string }> = [];

    for (let index = MAX_DAILY_POINTS - 1; index >= 0; index -= 1) {
      const day = startOfDay(subDays(reference, index));
      const end = addDays(day, 1);
      segments.push({
        name: format(day, "dd/MM", { locale: ptBR }),
        start: day.getTime(),
        end: end.getTime(),
        label: format(day, "dd 'de' MMMM yyyy", { locale: ptBR })
      });
    }

    return segments.map(({ name, start, end, label }) => {
      let totalValue = 0;
      let totalQuantity = 0;

      for (const movement of lineFilteredMovements) {
        if (movement.timestamp >= start && movement.timestamp < end) {
          const qty = Math.abs(Number(movement.effectiveQty ?? movement.qty ?? 0));
          const unitPrice = Number(movement.product?.unitPrice ?? 0);
          totalQuantity += qty;
          totalValue += unitPrice * qty;
        }
      }

      return {
        name,
        label,
        value: totalValue,
        quantity: totalQuantity
      };
    });
  }, [lineFilteredMovements]);

  const dailyColumnsView = useMemo(() => {
    const window = Math.max(1, dailyWindow);
    return dailyColumnsSeries.slice(-window);
  }, [dailyColumnsSeries, dailyWindow]);

  const categoryDonutData = useMemo<CosmicDonutDatum[]>(() => {
    const entries = Object.entries(valueByCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const totalValue = entries.reduce((accumulator, item) => accumulator + item.value, 0);
    return entries.map((entry, index) => ({
      ...entry,
      color: COSMIC_DONUT_COLORS[index % COSMIC_DONUT_COLORS.length],
      helper:
        totalValue > 0 ? `${((entry.value / totalValue) * 100).toFixed(1)}% do total` : undefined
    }));
  }, [valueByCategory]);

  const supplierDonutData = useMemo<CosmicDonutDatum[]>(() => {
    const rawEntries = Object.entries(valueBySupplier)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    let entries: Array<{ name: string; value: number; helper?: string }> = rawEntries;
    if (rawEntries.length > SUPPLIER_DONUT_MAX_SLICES) {
      const limit = Math.max(SUPPLIER_DONUT_MAX_SLICES - 1, 1);
      const topSuppliers = rawEntries.slice(0, limit);
      const remaining = rawEntries.slice(limit);
      const othersTotal = remaining.reduce((accumulator, item) => accumulator + item.value, 0);
      entries =
        othersTotal > 0
          ? [
              ...topSuppliers,
              {
                name: `Outros (+${remaining.length})`,
                value: othersTotal,
                helper: `${remaining.length} fornecedores agrupados`
              }
            ]
          : topSuppliers;
    }

    const totalValue = entries.reduce((accumulator, item) => accumulator + item.value, 0);
    return entries.map((entry, index) => ({
      ...entry,
      color: COSMIC_DONUT_COLORS[index % COSMIC_DONUT_COLORS.length],
      helper:
        entry.helper ??
        (totalValue > 0 ? `${((entry.value / totalValue) * 100).toFixed(1)}% do total` : undefined)
    }));
  }, [valueBySupplier]);

  const supplierProductDonuts = useMemo(() => {
    if (!visibleProducts.length) {
      return new Map<string, ProductGroupDetail>();
    }
    return buildProductGroupDetails(
      visibleProducts,
      productSalesAggregates,
      (product) => product.supplier?.trim() || "Sem fornecedor"
    );
  }, [visibleProducts, productSalesAggregates]);

  const categoryProductDonuts = useMemo(() => {
    if (!visibleProducts.length) {
      return new Map<string, ProductGroupDetail>();
    }
    return buildProductGroupDetails(
      visibleProducts,
      productSalesAggregates,
      (product) => product.category?.trim() || "Sem categoria"
    );
  }, [visibleProducts, productSalesAggregates]);

  useEffect(() => {
    setSelectedSuppliers((current) => current.filter((supplier) => supplierProductDonuts.has(supplier)));
  }, [supplierProductDonuts]);

  useEffect(() => {
    if (!selectedCategory) {
      return;
    }
    if (!categoryProductDonuts.has(selectedCategory)) {
      setSelectedCategory(null);
    }
  }, [categoryProductDonuts, selectedCategory]);

  const activeSupplier = selectedSuppliers[0] ?? null;
  const activeCategory = selectedCategory;

  const toggleSupplierSelection = useCallback((supplierName: string) => {
    setSelectedSuppliers((prev) => (prev.includes(supplierName) ? [] : [supplierName]));
  }, []);

  const toggleCategorySelection = useCallback((categoryName: string) => {
    setSelectedCategory((prev) => (prev === categoryName ? null : categoryName));
  }, []);

  const supplierSupplementarySections = useMemo(() => {
    if (!activeSupplier) {
      return [];
    }

    const detail = supplierProductDonuts.get(activeSupplier);
    if (!detail) {
      return [];
    }

    const valueSubtitle = detail.value.length
      ? `${detail.value.length} produto(s)`
      : "Sem produtos para exibir";
    const quantitySubtitle = detail.quantity.length
      ? `${detail.quantity.length} produto(s)`
      : "Sem produtos para exibir";

    return [
      {
        id: `supplier-${activeSupplier}-value`,
        title: "Produtos por valor",
        subtitle: valueSubtitle,
        data: detail.value,
        valueFormatter: currency,
        totalFormatter: currency,
        emptyMessage: "Sem produtos para exibir."
      },
      {
        id: `supplier-${activeSupplier}-quantity`,
        title: "Produtos por quantidade",
        subtitle: quantitySubtitle,
        data: detail.quantity,
        valueFormatter: formatUnits,
        totalFormatter: formatUnits,
        emptyMessage: "Sem produtos para exibir."
      }
    ];
  }, [activeSupplier, supplierProductDonuts]);

  const categorySupplementarySections = useMemo(() => {
    if (!activeCategory) {
      return [];
    }

    const detail = activeCategory ? categoryProductDonuts.get(activeCategory) : undefined;
    if (!detail) {
      return [];
    }

    const valueSubtitle = detail.value.length
      ? `${detail.value.length} produto(s)`
      : "Sem produtos para exibir";
    const quantitySubtitle = detail.quantity.length
      ? `${detail.quantity.length} produto(s)`
      : "Sem produtos para exibir";

    return [
      {
        id: `category-${activeCategory}-value`,
        title: "Produtos por valor",
        subtitle: valueSubtitle,
        data: detail.value,
        valueFormatter: currency,
        totalFormatter: currency,
        emptyMessage: "Sem produtos para exibir."
      },
      {
        id: `category-${activeCategory}-quantity`,
        title: "Produtos por quantidade",
        subtitle: quantitySubtitle,
        data: detail.quantity,
        valueFormatter: formatUnits,
        totalFormatter: formatUnits,
        emptyMessage: "Sem produtos para exibir."
      }
    ];
  }, [activeCategory, categoryProductDonuts]);

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

  const hasStockFilters =
    Boolean(categoryFilter || supplierFilter || productFilter || productLineFilter !== "all") ||
  activeComparisonKeys.length !== DEFAULT_COMPARISON_KEYS.length ||
  DEFAULT_COMPARISON_KEYS.some((key) => !activeComparisonKeys.includes(key)) ||
  comparisonWindow !== DEFAULT_COMPARISON_WINDOW ||
  dailyWindow !== DEFAULT_DAILY_WINDOW ||
  Boolean(activeSupplier) ||
  Boolean(activeCategory);
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
    setProductLineFilter("all");
    setActiveComparisonKeys([...DEFAULT_COMPARISON_KEYS]);
    setComparisonWindow(DEFAULT_COMPARISON_WINDOW);
    setDailyWindow(DEFAULT_DAILY_WINDOW);
    setSelectedSuppliers([]);
    setSelectedCategory(null);
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
    setUserStartDate("");
    setUserEndDate("");
    setUserMetric("quantity");
  };
  return (
    <div className="space-y-8">
      <header>
        <div className="relative overflow-hidden rounded-[36px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl shadow-purple-900/20 backdrop-blur">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-500/20 via-indigo-500/10 to-cyan-500/20" />
          <div className="pointer-events-none absolute -top-32 -left-24 h-64 w-64 rounded-full bg-purple-500/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-36 right-0 h-72 w-72 rounded-full bg-cyan-500/25 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-3xl font-semibold text-white drop-shadow-sm">{tabCopy.title}</h1>
                <p className="text-sm font-medium text-white/70">{tabCopy.description}</p>
              </div>
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
                <div className="inline-flex rounded-full border border-white/10 bg-white/10 p-1 shadow-inner shadow-purple-500/20 backdrop-blur">
                  <button
                    type="button"
                    onClick={() => setActiveTab("stock")}
                    className={`rounded-full px-4 py-1 text-sm font-semibold transition ${
                      activeTab === "stock"
                        ? "bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 text-slate-900 shadow-lg shadow-cyan-500/40"
                        : "text-white/70 hover:text-white"
                    }`}
                  >
                    Estoque
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("users")}
                    className={`rounded-full px-4 py-1 text-sm font-semibold transition ${
                      activeTab === "users"
                        ? "bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 text-slate-900 shadow-lg shadow-cyan-500/40"
                        : "text-white/70 hover:text-white"
                    }`}
                  >
                    Usuarios
                  </button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start rounded-full border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white/80 shadow-md shadow-cyan-500/10 transition hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={handleClearFilters}
                  disabled={!hasCurrentTabFilters}
                >
                  Limpar filtros
                </Button>
              </div>
            </div>

            {activeTab === "stock" ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 shadow-inner shadow-indigo-500/10 backdrop-blur">
                  <Label
                    htmlFor="dashboard-category"
                    className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60"
                  >
                    Categoria
                  </Label>
                  <Select
                    id="dashboard-category"
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                    className="mt-2 min-w-[200px] border-white/20 bg-white/15 text-sm font-medium text-white shadow-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/40"
                  >
                    <option value="">Todas as categorias</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 shadow-inner shadow-indigo-500/10 backdrop-blur">
                  <Label
                    htmlFor="dashboard-supplier"
                    className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60"
                  >
                    Fornecedor
                  </Label>
                  <Select
                    id="dashboard-supplier"
                    value={supplierFilter}
                    onChange={(event) => setSupplierFilter(event.target.value)}
                    className="mt-2 min-w-[200px] border-white/20 bg-white/15 text-sm font-medium text-white shadow-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/40"
                  >
                    <option value="">Todos os fornecedores</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier} value={supplier}>
                        {supplier}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 shadow-inner shadow-indigo-500/10 backdrop-blur">
                  <Label
                    htmlFor="dashboard-product"
                    className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60"
                  >
                    Produto
                  </Label>
                  <Select
                    id="dashboard-product"
                    value={productFilter}
                    onChange={(event) => setProductFilter(event.target.value)}
                    className="mt-2 min-w-[200px] border-white/20 bg-white/15 text-sm font-medium text-white shadow-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/40"
                  >
                    <option value="">Todos os produtos</option>
                    {productOptions.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.sku})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 shadow-inner shadow-indigo-500/10 backdrop-blur">
                  <Label
                    htmlFor="dashboard-line"
                    className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60"
                  >
                    Linha
                  </Label>
                  <Select
                    id="dashboard-line"
                    value={productLineFilter}
                    onChange={(event) => setProductLineFilter(event.target.value as "all" | ProductLine)}
                    className="mt-2 min-w-[200px] border-white/20 bg-white/15 text-sm font-medium text-white shadow-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/40"
                  >
                    {PRODUCT_LINE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center text-slate-500">Carregando metricas...</div>
      ) : activeTab === "stock" ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatsCard label="Itens em estoque" value={totalItems.toLocaleString("pt-BR")} accent="default" />
            <StatsCard label="Valor em estoque" value={currency(totalValue)} accent="success" />
            <StatsCard label="Saidas hoje" value={`${todayStats.totalQty} itens`} description={currency(todayStats.totalVal)} accent="danger" />
            <StatsCard label="Saidas na semana" value={`${weekStats.totalQty} itens`} description={currency(weekStats.totalVal)} accent="default" />
            <StatsCard className="xl:col-span-2" label="Saidas no mes" value={`${monthStats.totalQty} itens`} description={currency(monthStats.totalVal)} accent="success" />
            <StatsCard className="xl:col-span-2" label="Saidas no ano" value={`${yearStats.totalQty} itens`} description={currency(yearStats.totalVal)} accent="danger" />
          </section>

          <section className="grid gap-4 xl:grid-cols-2 auto-rows-fr">
            <DailyColumnsChart
              className="h-full"
              data={dailyColumnsView}
              title="Saidas diarias"
              emptyMessage="Sem movimentacoes registradas nos dias recentes."
              headerActions={
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Periodo
                  </span>
                  {DAILY_WINDOW_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={dailyWindow === option.value ? "default" : "ghost"}
                      className={`rounded-full px-3 text-xs font-semibold ${dailyWindow === option.value ? "" : "border border-slate-300 dark:border-slate-700"}`}
                      onClick={() => setDailyWindow(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              }
            />
            <ComparisonAreaChart
              className="h-full"
              data={comparisonSeriesView}
              title="Saidas (comparativo)"
              activeKeys={activeComparisonKeys}
              emptyMessage="Sem movimentacoes suficientes para comparar os periodos selecionados."
              headerActions={
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {COMPARISON_OPTIONS.map((option) => {
                      const isActive = activeComparisonKeys.includes(option.key);
                      return (
                        <Button
                          key={option.key}
                          type="button"
                          size="sm"
                          variant={isActive ? "default" : "ghost"}
                          className={`rounded-full px-3 text-xs font-semibold ${isActive ? "" : "border border-slate-300 dark:border-slate-700"}`}
                          onClick={() => toggleComparisonKey(option.key)}
                          disabled={isActive && activeComparisonKeys.length === 1}
                        >
                          {option.label}
                        </Button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Zoom
                    </span>
                    {COMPARISON_WINDOW_OPTIONS.map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant={comparisonWindow === option.value ? "default" : "ghost"}
                        className={`rounded-full px-3 text-xs font-semibold ${comparisonWindow === option.value ? "" : "border border-slate-300 dark:border-slate-700"}`}
                        onClick={() => setComparisonWindow(option.value)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
              }
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-2 auto-rows-fr">
            <CosmicDonutPanel
              data={categoryDonutData}
              title="Valor por categoria"
              subtitle={`${categoryDonutData.length} categorias`}
              valueFormatter={currency}
              totalFormatter={currency}
              selectable
              selectedKeys={activeCategory ? [activeCategory] : []}
              onSelectItem={toggleCategorySelection}
              maxVisibleItems={10}
              supplementaryDonuts={categorySupplementarySections}
            />
            <CosmicDonutPanel
              data={supplierDonutData}
              title="Valor por fornecedor"
              subtitle={`${supplierDonutData.length} fornecedores`}
              valueFormatter={currency}
              totalFormatter={currency}
              selectable
              selectedKeys={activeSupplier ? [activeSupplier] : []}
              onSelectItem={toggleSupplierSelection}
              maxVisibleItems={10}
              supplementaryDonuts={supplierSupplementarySections}
            />
          </section>

          <section className="grid gap-4">
            <ProductsBarChart
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
                    className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium uppercase tracking-wide text-slate-600 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700"
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
                    className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium uppercase tracking-wide text-slate-600 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700"
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
                  className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium uppercase tracking-wide text-slate-600 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700"
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
                  className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium uppercase tracking-wide text-slate-600 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700"
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
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Atividade por usuario</h2>
                    <p className="text-sm text-slate-500">
                      Selecione usuarios para ver quantas saidas foram bipadas, categorias mais frequentes e produtos destacados no periodo escolhido.
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
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                      <div className="space-y-1">
                        <Label
                          htmlFor="dashboard-user-metric"
                          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                        >
                          Metricas exibidas
                        </Label>
                        <Select
                          id="dashboard-user-metric"
                          value={userMetric}
                          onChange={(event) => setUserMetric(event.target.value as UserMetric)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700"
                        >
                          <option value="quantity">Embalados</option>
                          <option value="actions">Movimentacoes</option>
                        </Select>
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
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {filteredUserOptions.map((user) => {
                        const active = selectedUserIds.includes(user.id);
                        return (
                          <Button
                            key={user.id}
                            type="button"
                            variant="outline"
                            className={`w-full justify-start text-left ${active ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-900" : ""}`}
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
                <UserComparisonChart data={comparisonData} title={comparisonTitle} quantityLabel={comparisonValueLabel} />
              ) : null}
              {selectedUsers.length ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {userStats.map((summary, index) => {
                    const topProducts = summary.topProducts.slice(0, 3);
                    const hasActivity = summary.totalQuantity > 0 || summary.totalActions > 0;
                    const accent = USER_CARD_STYLES[index % USER_CARD_STYLES.length];
                    const primaryMetricLabel = userMetric === "quantity" ? "Embalados" : "Movimentacoes";
                    const primaryMetricValue = userMetric === "quantity" ? summary.totalQuantity : summary.totalActions;
                    const secondaryMetricText =
                      userMetric === "quantity"
                        ? `${summary.totalActions.toLocaleString("pt-BR")} movimentacoes gerais`
                        : `${summary.totalQuantity.toLocaleString("pt-BR")} embalados`;

                    return (
                      <UserActivityCard
                        key={summary.id}
                        accent={accent}
                        name={summary.name}
                        primaryMetricLabel={primaryMetricLabel}
                        primaryMetricValue={primaryMetricValue.toLocaleString("pt-BR")}
                        secondaryMetricText={secondaryMetricText}
                        formattedTotalValue={currency(summary.totalValue)}
                        lastScanText={formatUserDate(summary.lastScan)}
                        firstScanText={formatUserDate(summary.firstScan)}
                        topProducts={topProducts}
                        hasActivity={hasActivity}
                        index={index}
                      />
                    );
                  })}
                </div>
              ) : null}
            </section>
          ) : (
            <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-400">
              Nenhum usuario com movimentacoes para exibir.
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface FloatingParticle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
}

type CardMouseState = {
  x: number;
  y: number;
  width: number;
  height: number;
};

interface UserActivityCardProps {
  accent: UserCardStyle;
  name: string;
  primaryMetricLabel: string;
  primaryMetricValue: string;
  secondaryMetricText: string;
  formattedTotalValue: string;
  lastScanText: string;
  firstScanText: string;
  topProducts: Array<UserActivitySummary["topProducts"][number]>;
  hasActivity: boolean;
  index: number;
}

function UserActivityCard({
  accent,
  name,
  primaryMetricLabel,
  primaryMetricValue,
  secondaryMetricText,
  formattedTotalValue,
  lastScanText,
  firstScanText,
  topProducts,
  hasActivity,
  index
}: UserActivityCardProps) {
  const baseTransform = "perspective(1200px) rotateX(0deg) rotateY(0deg) scale(1) translateZ(0)";
  const [transform, setTransform] = useState(baseTransform);
  const [glowIntensity, setGlowIntensity] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [mousePosition, setMousePosition] = useState<CardMouseState>({ x: 0, y: 0, width: 0, height: 0 });
  const [particles, setParticles] = useState<FloatingParticle[]>([]);

  useEffect(() => {
    const generatedParticles: FloatingParticle[] = Array.from({ length: 18 }, (_, idx) => ({
      id: idx,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.5 + 1.5,
      duration: Math.random() * 2 + 2.6,
      delay: Math.random() * 1.5
    }));
    setParticles(generatedParticles);
  }, []);

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setTransform(baseTransform);
    setGlowIntensity(0);
    setMousePosition({ x: 0, y: 0, width: 0, height: 0 });
  };

  const handleMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const rotateX = ((y / rect.height) - 0.5) * 15;
    const rotateY = ((x / rect.width) - 0.5) * -15;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
    const maxDistance = Math.sqrt(centerX ** 2 + centerY ** 2);
    const intensity = Math.max(0, Math.min(1, 1 - distance / maxDistance));

    const scale = 1.02 + intensity * 0.03;

    setMousePosition({ x, y, width: rect.width, height: rect.height });
    setGlowIntensity(intensity);
    setTransform(
      `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale.toFixed(4)}) translateZ(0)`
    );
  };

  const cardDelay = Math.min(index * 0.05, 0.3);
  const shineLeft = mousePosition.width ? mousePosition.x - mousePosition.width * 0.25 : 0;

  return (
    <motion.div
      className="relative h-full w-full rounded-3xl"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: cardDelay, ease: "easeOut" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      style={{
        transform,
        transformStyle: "preserve-3d",
        transition: "transform 150ms ease-out",
        willChange: "transform"
      }}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 z-0 rounded-3xl opacity-0"
        animate={{ opacity: Math.min(0.85, glowIntensity * 0.9) }}
        style={{
          background: accent.glowGradient,
          filter: `blur(${20 + glowIntensity * 14}px)`
        }}
      />
      <div className="relative z-10 overflow-hidden rounded-[28px]">
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{ background: accent.conicGradient }}
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
        />
        <div
          className={`relative z-10 m-[3px] flex h-full flex-col overflow-hidden rounded-[24px] border bg-white/95 p-5 shadow-xl backdrop-blur dark:bg-slate-950/90 dark:shadow-slate-950/30 ${accent.border}`}
        >
          <AnimatePresence>
            {isHovered ? (
              <motion.div
                key="shine"
                className="pointer-events-none absolute inset-0 z-40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div
                  className="absolute top-0 h-full w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                  style={{
                    left: `${shineLeft}px`,
                    transform: "skewX(-18deg)"
                  }}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {particles.map((particle) => (
            <motion.div
              key={particle.id}
              className="pointer-events-none absolute z-20 rounded-full bg-white/60"
              style={{
                left: `${particle.x}%`,
                top: `${particle.y}%`,
                width: `${particle.size}px`,
                height: `${particle.size}px`
              }}
              animate={{
                y: [0, -18, 0],
                opacity: [0, 0.6, 0],
                scale: [0.8, 1.1, 0.8]
              }}
              transition={{
                duration: particle.duration,
                repeat: Infinity,
                delay: particle.delay,
                ease: "easeInOut"
              }}
            />
          ))}

          <div className="relative z-30 flex h-full flex-col gap-5">
            <div className={`rounded-2xl border border-white/10 bg-gradient-to-r ${accent.gradient} px-5 py-4 text-white shadow-lg`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <motion.div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 shadow-lg dark:bg-white/10"
                    whileHover={{ rotate: 8, scale: 1.05 }}
                    transition={{ type: "spring", stiffness: 220, damping: 16 }}
                  >
                    <Sparkles className="h-6 w-6 text-white" />
                  </motion.div>
                  <div>
                    <h3 className="text-2xl font-semibold text-white">{name}</h3>
                    <p className="text-xs text-white/80">{secondaryMetricText}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-white/70">{primaryMetricLabel}</p>
                  <p className="text-3xl font-bold text-white">{primaryMetricValue}</p>
                </div>
              </div>
            </div>

            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-xl bg-white/85 p-3 shadow-sm ring-1 ring-white/50 backdrop-blur-sm dark:bg-slate-900/80 dark:ring-white/20">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Valor movimentado</dt>
                <dd className={`text-base font-semibold ${accent.metric}`}>{formattedTotalValue}</dd>
              </div>
              <div className="rounded-xl bg-white/85 p-3 shadow-sm ring-1 ring-white/50 backdrop-blur-sm dark:bg-slate-900/80 dark:ring-white/20">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Ultima saida</dt>
                <dd className="text-base font-semibold text-slate-700">{lastScanText}</dd>
              </div>
              <div className="rounded-xl bg-white/85 p-3 shadow-sm ring-1 ring-white/50 backdrop-blur-sm dark:bg-slate-900/80 dark:ring-white/20">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Primeira saida</dt>
                <dd className="text-base font-semibold text-slate-700">{firstScanText}</dd>
              </div>
            </dl>

            {hasActivity ? (
              <div className="rounded-2xl bg-slate-50/90 p-4 shadow-inner ring-1 ring-white/60 backdrop-blur-sm dark:bg-slate-900/70 dark:ring-white/10">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Produtos mais bipados</p>
                <ul className="mt-3 space-y-2 text-sm">
                  {topProducts.map((product) => (
                    <motion.li
                      key={`${name}-${product.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl bg-white/90 px-3 py-2 shadow-sm ring-1 ring-slate-200/60 backdrop-blur dark:bg-slate-900/80 dark:ring-slate-700/60"
                      whileHover={{ scale: 1.03, translateY: -2 }}
                      transition={{ type: "spring", stiffness: 260, damping: 18 }}
                    >
                      <span className="truncate pr-2 font-medium text-slate-700">{product.name}</span>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${accent.pill}`}>
                        {product.quantity.toLocaleString("pt-BR")} itens
                      </span>
                    </motion.li>
                  ))}
                  {!topProducts.length ? (
                    <li className="rounded-xl bg-white/80 px-3 py-2 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200/60 dark:bg-slate-900/70 dark:text-slate-400 dark:ring-slate-700/60">
                      Sem produtos destacados no periodo.
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-50/90 p-4 text-sm text-slate-600 shadow-inner ring-1 ring-white/60 backdrop-blur-sm dark:bg-slate-900/70 dark:text-slate-300 dark:ring-white/10">
                Sem movimentacoes para este usuario no periodo selecionado.
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
