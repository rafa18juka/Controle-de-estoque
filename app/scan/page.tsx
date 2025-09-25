"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { BarcodeScanner } from "@/components/barcode-scanner";
import { ProtectedRoute } from "@/components/protected-route";
import { RoleGate } from "@/components/role-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/providers/auth-provider";
import { ensureFirebase } from "@/lib/firebase-client";
import type { Product } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export default function ScanPage() {
  return (
    <ProtectedRoute>
      <RoleGate allow={["admin", "staff"]}>
        <ScanContent />
      </RoleGate>
    </ProtectedRoute>
  );
}

function ScanContent() {
  const { user } = useAuth();
  const [currentSku, setCurrentSku] = useState<string>("");
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!currentSku) {
      setProduct(null);
      return;
    }

    const lookup = async () => {
      setLoadingProduct(true);
      try {
        const bundle = await ensureFirebase();
        const { firestore } = bundle;
        const querySnapshot = await firestore.getDocs(
          firestore.query(
            firestore.collection(bundle.db, "products"),
            firestore.where("sku", "==", currentSku)
          )
        );
        if (!querySnapshot.empty) {
          const doc = querySnapshot.docs[0];
          const data = doc.data();
          setProduct({ id: doc.id, ...data } as Product);
        } else {
          setProduct(null);
          toast.error("Produto não encontrado para este SKU");
        }
      } catch (error) {
        console.error(error);
        toast.error("Falha ao buscar produto. Verifique sua conexão.");
      } finally {
        setLoadingProduct(false);
      }
    };

    lookup();
  }, [currentSku]);

  const handleScan = (value: string) => {
    setCurrentSku(value.trim());
  };

  const handleQuantityChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value) || 1;
    setQuantity(Math.max(1, next));
  };

  const handleSubmit = async () => {
    if (!user || !product) return;
    if (quantity <= 0) {
      toast.error("Informe uma quantidade válida");
      return;
    }

    setProcessing(true);
    try {
      const bundle = await ensureFirebase();
      const { firestore } = bundle;
      await firestore.runTransaction(bundle.db, async (transaction: any) => {
        const productRef = firestore.doc(bundle.db, "products", product.id);
        const snapshot = await transaction.get(productRef);
        if (!snapshot.exists()) {
          throw new Error("Produto não encontrado");
        }
        const data = snapshot.data();
        const currentQuantity = data.quantity ?? 0;
        if (currentQuantity < quantity) {
          throw new Error("Estoque insuficiente para essa saída");
        }
        const newQuantity = currentQuantity - quantity;
        transaction.update(productRef, {
          quantity: newQuantity,
          totalValue: Number((newQuantity * data.unitPrice).toFixed(2))
        });
        const movementsRef = firestore.collection(bundle.db, "stockMovements");
        const movementDoc = firestore.doc(movementsRef);
        transaction.set(movementDoc, {
          productId: product.id,
          sku: product.sku,
          qty: quantity,
          type: "out",
          userId: user.uid,
          userName: user.displayName ?? user.email,
          timestamp: Date.now()
        });
      });
      toast.success("Saída registrada com sucesso");
      setQuantity(1);
      setCurrentSku("");
      setProduct(null);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar a saída");
    } finally {
      setProcessing(false);
    }
  };

  const productDetails = useMemo(() => {
    if (!product) return null;
    return (
      <div className="card space-y-2">
        <h3 className="text-lg font-semibold text-slate-900">{product.name}</h3>
        <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          <div>
            <span className="font-medium text-slate-500">SKU:</span> {product.sku}
          </div>
          <div>
            <span className="font-medium text-slate-500">Preço:</span> {formatCurrency(product.unitPrice)}
          </div>
          <div>
            <span className="font-medium text-slate-500">Categoria:</span> {product.category ?? "—"}
          </div>
          <div>
            <span className="font-medium text-slate-500">Fornecedor:</span> {product.supplier ?? "—"}
          </div>
          <div>
            <span className="font-medium text-slate-500">Estoque atual:</span> {product.quantity}
          </div>
          <div>
            <span className="font-medium text-slate-500">Valor total:</span> {formatCurrency(product.totalValue)}
          </div>
        </div>
      </div>
    );
  }, [product]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-card lg:flex-row">
        <div className="flex-1 space-y-4">
          <h2 className="text-xl font-semibold text-slate-900">Escanear código de barras</h2>
          <p className="text-sm text-slate-500">
            Aponte a câmera para o código Code128 do produto. Você também pode digitar o SKU manualmente.
          </p>
          <BarcodeScanner onResult={handleScan} />
        </div>
        <div className="flex w-full max-w-sm flex-col gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-600">SKU detectado</label>
            <Input
              value={currentSku}
              placeholder="000000000000"
              onChange={(event) => setCurrentSku(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-600">Quantidade para baixa</label>
            <Input type="number" min={1} value={quantity} onChange={handleQuantityChange} />
          </div>
          <Button onClick={handleSubmit} disabled={!product || processing} className="w-full">
            {processing ? "Processando…" : "Dar baixa"}
          </Button>
          {loadingProduct && <p className="text-sm text-slate-500">Buscando produto…</p>}
        </div>
      </div>
      {productDetails}
    </div>
  );
}
