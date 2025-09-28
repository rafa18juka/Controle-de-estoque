"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { EditableTable } from "@/components/editable-table";
import { ProtectedRoute } from "@/components/protected-route";
import { RoleGate } from "@/components/role-gate";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ZPLPreview } from "@/components/zpl-preview";
import { ensureFirebase } from "@/lib/firebase-client";
import type { Category, Product, Supplier } from "@/lib/types";
import { generateZPL, type LabelItem } from "@/lib/zpl";

const newProductSchema = z.object({
  name: z.string().min(2, "Informe o nome do produto"),
  sku: z.string().min(3, "Informe um SKU válido"),
  unitPrice: z.coerce.number().min(0, "Preço inválido"),
  quantity: z.coerce.number().min(0, "Quantidade inválida"),
  category: z.string().optional(),
  supplier: z.string().optional()
});

type NewProductValues = z.infer<typeof newProductSchema>;

const LABEL_WIDTH_MM = 40;
const LABEL_HEIGHT_MM = 20;
const LABEL_COLUMNS = 2;
const LABEL_COLUMN_GAP_MM = 3;


export default function InventoryPage() {
  return (
    <ProtectedRoute>
      <RoleGate allow={["admin"]}>
        <InventoryContent />
      </RoleGate>
    </ProtectedRoute>
  );
}

function InventoryContent() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryList, setCategoryList] = useState<Category[]>([]);
  const [supplierList, setSupplierList] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [labelPreview, setLabelPreview] = useState<{
    zpl: string;
    items: LabelItem[];
    count: number;
    quantity: number;
    widthMm: number;
    heightMm: number;
    columns: number;
    columnGapMm: number;
  } | null>(null);

  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [supplierManagerOpen, setSupplierManagerOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [deletingSupplierId, setDeletingSupplierId] = useState<string | null>(null);

  const form = useForm<NewProductValues>({
    resolver: zodResolver(newProductSchema),
    defaultValues: {
      name: "",
      sku: "",
      unitPrice: 0,
      quantity: 0,
      category: "",
      supplier: ""
    }
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const bundle = await ensureFirebase();
        const { firestore } = bundle;
        const productsSnapshot = await firestore.getDocs(firestore.collection(bundle.db, "products"));
        const loadedProducts: Product[] = productsSnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
        setProducts(loadedProducts);

        const categoriesSnapshot = await firestore.getDocs(firestore.collection(bundle.db, "categories"));
        const loadedCategories: Category[] = categoriesSnapshot.docs
          .map((doc: any) => {
            const data = doc.data() as { name?: string };
            const name = typeof data.name === "string" ? data.name : "";
            return name ? { id: doc.id, name } : null;
          })
          .filter(Boolean) as Category[];
        setCategoryList(loadedCategories);

        const suppliersSnapshot = await firestore.getDocs(firestore.collection(bundle.db, "suppliers"));
        const loadedSuppliers: Supplier[] = suppliersSnapshot.docs
          .map((doc: any) => {
            const data = doc.data() as { name?: string };
            const name = typeof data.name === "string" ? data.name : "";
            return name ? { id: doc.id, name } : null;
          })
          .filter(Boolean) as Supplier[];
        setSupplierList(loadedSuppliers);
      } catch (error) {
        console.error(error);
        toast.error("Nao foi possivel carregar o estoque");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const updateLists = (updatedProducts: Product[]) => {
    setProducts(updatedProducts);
  };
  const categoryOptions = useMemo(() => {
    const fromCollection = categoryList.map((item) => item.name);
    const fromProducts = products
      .map((product) => (product.category ?? "").trim())
      .filter((name) => name.length > 0);
    const unique = Array.from(new Set([...fromCollection, ...fromProducts]));
    return unique.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [categoryList, products]);

  const supplierOptions = useMemo(() => {
    const fromCollection = supplierList.map((item) => item.name);
    const fromProducts = products
      .map((product) => (product.supplier ?? "").trim())
      .filter((name) => name.length > 0);
    const unique = Array.from(new Set([...fromCollection, ...fromProducts]));
    return unique.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [supplierList, products]);

  const categoryExists = (name: string) =>
    categoryList.some((category) => category.name.toLowerCase() === name.trim().toLowerCase());

  const supplierExists = (name: string) =>
    supplierList.some((supplier) => supplier.name.toLowerCase() === name.trim().toLowerCase());
  const createCategoryIfMissing = async (name: string, bundle?: any) => {
    const trimmed = name.trim();
    if (!trimmed || categoryExists(trimmed)) return false;
    const activeBundle = bundle ?? (await ensureFirebase());
    const { firestore } = activeBundle;
    const docRef = await firestore.addDoc(firestore.collection(activeBundle.db, "categories"), {
      name: trimmed
    });
    setCategoryList((prev) => [...prev, { id: docRef.id, name: trimmed }]);
    return true;
  };

  const createSupplierIfMissing = async (name: string, bundle?: any) => {
    const trimmed = name.trim();
    if (!trimmed || supplierExists(trimmed)) return false;
    const activeBundle = bundle ?? (await ensureFirebase());
    const { firestore } = activeBundle;
    const docRef = await firestore.addDoc(firestore.collection(activeBundle.db, "suppliers"), {
      name: trimmed
    });
    setSupplierList((prev) => [...prev, { id: docRef.id, name: trimmed }]);
    return true;
  };
  const sortedCategories = useMemo(
    () => [...categoryList].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [categoryList]
  );

  const sortedSuppliers = useMemo(
    () => [...supplierList].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [supplierList]
  );
  const handleUpdateProduct = async (id: string, changes: Partial<Product>) => {
    const current = products.find((product) => product.id === id);
    if (!current) return;
    const unitPrice =
      typeof changes.unitPrice === "number" ? Math.max(0, changes.unitPrice) : current.unitPrice;
    const quantity = typeof changes.quantity === "number" ? Math.max(0, changes.quantity) : current.quantity;
    const updated: Product = {
      ...current,
      ...changes,
      unitPrice,
      quantity,
      totalValue: Number((quantity * unitPrice).toFixed(2))
    };

    try {
      const bundle = await ensureFirebase();
      const { firestore } = bundle;
      const productRef = firestore.doc(bundle.db, "products", id);
      await firestore.updateDoc(productRef, {
        name: updated.name,
        sku: updated.sku,
        unitPrice: updated.unitPrice,
        quantity: updated.quantity,
        totalValue: updated.totalValue,
        category: updated.category ?? null,
        supplier: updated.supplier ?? null
      });
      updateLists(products.map((product) => (product.id === id ? updated : product)));
      toast.success("Produto atualizado");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao atualizar produto");
    }
  };

  const handleDeleteProducts = async (ids: string[]) => {
    if (!ids.length) return;
    if (!confirm("Excluir produtos selecionados?")) return;
    try {
      const bundle = await ensureFirebase();
      const { firestore } = bundle;
      await Promise.all(
        ids.map((id) => firestore.deleteDoc(firestore.doc(bundle.db, "products", id)))
      );
      updateLists(products.filter((product) => !ids.includes(product.id)));
      toast.success("Produtos excluídos");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao excluir produtos");
    }
  };

  const handleSubmitCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      toast.error("Informe o nome da categoria.");
      return;
    }
    if (categoryExists(trimmed)) {
      toast.error("Esta categoria ja foi cadastrada.");
      return;
    }
    try {
      setSavingCategory(true);
      await createCategoryIfMissing(trimmed);
      setNewCategoryName("");
      toast.success("Categoria adicionada.");
    } catch (error) {
      console.error(error);
      toast.error("Falha ao criar categoria.");
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    const category = categoryList.find((item) => item.id === id);
    if (!category) return;
    if (products.some((product) => (product.category ?? "").trim().toLowerCase() === category.name.toLowerCase())) {
      toast.error("Remova ou atualize os produtos dessa categoria antes de exclui-la.");
      return;
    }
    try {
      setDeletingCategoryId(id);
      const bundle = await ensureFirebase();
      const { firestore } = bundle;
      await firestore.deleteDoc(firestore.doc(bundle.db, "categories", id));
      setCategoryList((prev) => prev.filter((item) => item.id !== id));
      toast.success("Categoria removida.");
    } catch (error) {
      console.error(error);
      toast.error("Falha ao remover categoria.");
    } finally {
      setDeletingCategoryId(null);
    }
  };

  const handleSubmitSupplier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = newSupplierName.trim();
    if (!trimmed) {
      toast.error("Informe o nome do fornecedor.");
      return;
    }
    if (supplierExists(trimmed)) {
      toast.error("Este fornecedor ja foi cadastrado.");
      return;
    }
    try {
      setSavingSupplier(true);
      await createSupplierIfMissing(trimmed);
      setNewSupplierName("");
      toast.success("Fornecedor adicionado.");
    } catch (error) {
      console.error(error);
      toast.error("Falha ao criar fornecedor.");
    } finally {
      setSavingSupplier(false);
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    const supplier = supplierList.find((item) => item.id === id);
    if (!supplier) return;
    if (products.some((product) => (product.supplier ?? "").trim().toLowerCase() === supplier.name.toLowerCase())) {
      toast.error("Remova ou atualize os produtos desse fornecedor antes de exclui-lo.");
      return;
    }
    try {
      setDeletingSupplierId(id);
      const bundle = await ensureFirebase();
      const { firestore } = bundle;
      await firestore.deleteDoc(firestore.doc(bundle.db, "suppliers", id));
      setSupplierList((prev) => prev.filter((item) => item.id !== id));
      toast.success("Fornecedor removido.");
    } catch (error) {
      console.error(error);
      toast.error("Falha ao remover fornecedor.");
    } finally {
      setDeletingSupplierId(null);
    }
  };
  const handleCreateProduct = form.handleSubmit(async (values) => {
    try {
      const bundle = await ensureFirebase();
      const { firestore } = bundle;
      const skuQuery = await firestore.getDocs(
        firestore.query(firestore.collection(bundle.db, "products"), firestore.where("sku", "==", values.sku))
      );
      if (!skuQuery.empty) {
        toast.error("Já existe um produto com este SKU");
        return;
      }
      const totalValue = Number((values.quantity * values.unitPrice).toFixed(2));
      const productData = {
        name: values.name,
        sku: values.sku,
        unitPrice: values.unitPrice,
        quantity: values.quantity,
        totalValue,
        category: values.category || null,
        supplier: values.supplier || null
      };
      const docRef = await firestore.addDoc(firestore.collection(bundle.db, "products"), productData);
      if (values.category) {
        await createCategoryIfMissing(values.category, bundle);
      }
      if (values.supplier) {
        await createSupplierIfMissing(values.supplier, bundle);
      }
      updateLists([...products, { id: docRef.id, ...productData } as Product]);
      toast.success("Produto criado");
      form.reset();
      setNewProductOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Erro ao criar produto");
    }
  });

  const handleGenerateLabels = (selected: Product[], quantity: number) => {
    if (!selected.length || quantity <= 0) return;

    const labelCopies: LabelItem[] = selected.flatMap((product) =>
      Array.from({ length: quantity }, () => ({
        sku: product.sku,
        name: product.name
      }))
    );

    if (!labelCopies.length) return;

    const chunks: LabelItem[][] = [];
    for (let index = 0; index < labelCopies.length; index += LABEL_COLUMNS) {
      chunks.push(labelCopies.slice(index, index + LABEL_COLUMNS));
    }

    const zplBlocks = chunks
      .map((items) =>
        generateZPL({
          items,
          widthMm: LABEL_WIDTH_MM,
          heightMm: LABEL_HEIGHT_MM,
          columns: LABEL_COLUMNS,
          columnGapMm: LABEL_COLUMN_GAP_MM
        })
      )
      .join("\n");

    setLabelPreview({
      zpl: zplBlocks,
      items: labelCopies,
      count: selected.length,
      quantity,
      widthMm: LABEL_WIDTH_MM,
      heightMm: LABEL_HEIGHT_MM,
      columns: LABEL_COLUMNS,
      columnGapMm: LABEL_COLUMN_GAP_MM
    });
  };
  const handleExport = () => {
    const payload = JSON.stringify(products, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "products.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) {
        toast.error("Formato inválido de arquivo");
        return;
      }
      const bundle = await ensureFirebase();
      const { firestore } = bundle;
      const updatedProducts = [...products];
      const newCategories = new Set<string>();
      const newSuppliers = new Set<string>();
      for (const item of data) {
        if (!item.sku || !item.name) continue;
        const querySnapshot = await firestore.getDocs(
          firestore.query(firestore.collection(bundle.db, "products"), firestore.where("sku", "==", item.sku))
        );
        const docData = {
          name: item.name,
          sku: item.sku,
          unitPrice: Number(item.unitPrice ?? 0),
          quantity: Number(item.quantity ?? 0),
          totalValue: Number(((item.quantity ?? 0) * (item.unitPrice ?? 0)).toFixed(2)),
          category: item.category || null,
          supplier: item.supplier || null
        };
        if (!querySnapshot.empty) {
          const docRef = querySnapshot.docs[0].ref;
          await firestore.updateDoc(docRef, docData);
          const id = querySnapshot.docs[0].id;
          const existingIndex = updatedProducts.findIndex((product) => product.id === id);
          if (existingIndex >= 0) {
            updatedProducts[existingIndex] = { id, ...docData } as Product;
          }
        } else {
          const docRef = await firestore.addDoc(firestore.collection(bundle.db, "products"), docData);
          updatedProducts.push({ id: docRef.id, ...docData } as Product);
        }
      }
      for (const name of newCategories) {
        await createCategoryIfMissing(name, bundle);
      }
      for (const name of newSuppliers) {
        await createSupplierIfMissing(name, bundle);
      }
      updateLists(updatedProducts);
      toast.success("Importação concluída");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao importar arquivo");
    }
  };

  const handleSeed = async () => {
    try {
      const bundle = await ensureFirebase();
      const { firestore } = bundle;
      const examples = [
        {
          name: "Sabonete Lava Jato",
          sku: "SKU-0001",
          unitPrice: 12.9,
          quantity: 50,
          category: "Higiene",
          supplier: "Império das Espumas"
        },
        {
          name: "Copo Térmico Mustafar",
          sku: "SKU-0002",
          unitPrice: 39.9,
          quantity: 20,
          category: "Utilidades",
          supplier: "Galactic Cups"
        },
        {
          name: "Cabo USB Jedi",
          sku: "SKU-0003",
          unitPrice: 19.9,
          quantity: 80,
          category: "Eletrônicos",
          supplier: "Conselho Tech"
        }
      ];
      const categoryNames = new Set<string>();
      const supplierNames = new Set<string>();
      const created: Product[] = [];
      for (const item of examples) {
        const totalValue = Number((item.unitPrice * item.quantity).toFixed(2));
        const docRef = await firestore.addDoc(firestore.collection(bundle.db, "products"), {
          ...item,
          totalValue
        });
        created.push({ id: docRef.id, ...item, totalValue });
        const categoryName = typeof item.category === "string" ? item.category.trim() : "";
        if (categoryName) {
          categoryNames.add(categoryName);
        }
        const supplierName = typeof item.supplier === "string" ? item.supplier.trim() : "";
        if (supplierName) {
          supplierNames.add(supplierName);
        }
      }
      for (const name of categoryNames) {
        await createCategoryIfMissing(name, bundle);
      }
      for (const name of supplierNames) {
        await createSupplierIfMissing(name, bundle);
      }
      updateLists([...products, ...created]);
      toast.success("Dados de exemplo criados");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao criar dados de exemplo");
    }
  };

  const infoText = useMemo(() => {
    if (!products.length) return "Sem produtos cadastrados ainda.";
    return `${products.length} produtos cadastrados.`;
  }, [products.length]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">Gestão de Estoque</h1>
        <p className="text-sm text-slate-500">
          Cadastre novos produtos, atualize informações em linha e gere etiquetas prontas para impressão Zebra.
        </p>
        <span className="text-xs uppercase tracking-wide text-slate-400">{infoText}</span>
      </header>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center text-slate-500">Carregando produtos…</div>
      ) : (
        <EditableTable
          products={products}
          categories={categoryOptions}
          suppliers={supplierOptions}
          onChange={handleUpdateProduct}
          onDelete={handleDeleteProducts}
          onCreate={() => setNewProductOpen(true)}
          onGenerateLabels={handleGenerateLabels}
          onExport={handleExport}
          onImport={handleImport}
          onSeed={handleSeed}
          onManageCategories={() => setCategoryManagerOpen(true)}
          onManageSuppliers={() => setSupplierManagerOpen(true)}
        />
      )}

      <Dialog open={newProductOpen} onOpenChange={setNewProductOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo produto</DialogTitle>
            <DialogDescription>
              Insira as informacoes abaixo para cadastrar um novo produto no estoque.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateProduct} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" {...form.register("name")} />
              {form.formState.errors.name ? (
                <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" {...form.register("sku")} />
              {form.formState.errors.sku ? (
                <p className="text-sm text-red-500">{form.formState.errors.sku.message}</p>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="unitPrice">Preço unitário</Label>
                <Input id="unitPrice" type="number" step="0.01" min="0" {...form.register("unitPrice")} />
                {form.formState.errors.unitPrice ? (
                  <p className="text-sm text-red-500">{form.formState.errors.unitPrice.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantidade</Label>
                <Input id="quantity" type="number" min="0" {...form.register("quantity")} />
                {form.formState.errors.quantity ? (
                  <p className="text-sm text-red-500">{form.formState.errors.quantity.message}</p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category">Categoria</Label>
                <Select id="category" value={form.watch("category") ?? ""} onChange={(event) => form.setValue("category", event.target.value)}>
                  <option value="">Sem categoria</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplier">Fornecedor</Label>
                <Select id="supplier" value={form.watch("supplier") ?? ""} onChange={(event) => form.setValue("supplier", event.target.value)}>
                  <option value="">Sem fornecedor</option>
                  {supplierOptions.map((supplier) => (
                    <option key={supplier} value={supplier}>
                      {supplier}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setNewProductOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar produto</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>


      <Dialog
        open={categoryManagerOpen}
        onOpenChange={(open) => {
          setCategoryManagerOpen(open);
          if (!open) {
            setNewCategoryName("");
            setSavingCategory(false);
            setDeletingCategoryId(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Gerenciar categorias</DialogTitle>
            <DialogDescription>Cadastre ou remova categorias dispon?veis para os produtos.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="sticky top-0 z-10 bg-white pb-4">
              <form onSubmit={handleSubmitCategory} className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="category-name">Nova categoria</Label>
                  <Input
                    id="category-name"
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    placeholder="Ex.: Utilidades"
                  />
                </div>
                <Button type="submit" disabled={savingCategory}>
                  {savingCategory ? "Salvando..." : "Adicionar"}
                </Button>
              </form>
            </div>
            {sortedCategories.length ? (
              <ul className="space-y-2 pb-2 pt-2">
                {sortedCategories.map((category) => (
                  <li
                    key={category.id}
                    className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                  >
                    <span className="text-sm font-medium text-slate-700">{category.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteCategory(category.id)}
                      disabled={deletingCategoryId === category.id}
                    >
                      {deletingCategoryId === category.id ? "Removendo..." : "Remover"}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-sm text-slate-500">Nenhuma categoria cadastrada ainda.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={supplierManagerOpen}
        onOpenChange={(open) => {
          setSupplierManagerOpen(open);
          if (!open) {
            setNewSupplierName("");
            setSavingSupplier(false);
            setDeletingSupplierId(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Gerenciar fornecedores</DialogTitle>
            <DialogDescription>Cadastre ou remova fornecedores utilizados nos produtos.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="sticky top-0 z-10 bg-white pb-4">
              <form onSubmit={handleSubmitSupplier} className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="supplier-name">Novo fornecedor</Label>
                  <Input
                    id="supplier-name"
                    value={newSupplierName}
                    onChange={(event) => setNewSupplierName(event.target.value)}
                    placeholder="Ex.: Imp?rio das Espumas"
                  />
                </div>
                <Button type="submit" disabled={savingSupplier}>
                  {savingSupplier ? "Salvando..." : "Adicionar"}
                </Button>
              </form>
            </div>
            {sortedSuppliers.length ? (
              <ul className="space-y-2 pb-2 pt-2">
                {sortedSuppliers.map((supplier) => (
                  <li
                    key={supplier.id}
                    className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                  >
                    <span className="text-sm font-medium text-slate-700">{supplier.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSupplier(supplier.id)}
                      disabled={deletingSupplierId === supplier.id}
                    >
                      {deletingSupplierId === supplier.id ? "Removendo..." : "Remover"}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-sm text-slate-500">Nenhum fornecedor cadastrado ainda.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(labelPreview)} onOpenChange={(open) => !open && setLabelPreview(null)}>
        <DialogContent className="max-w-3xl">
          {labelPreview ? (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle>Etiquetas geradas</DialogTitle>
                <DialogDescription>
                  Pre-visualizacao das primeiras etiquetas. O arquivo contara {labelPreview.count} produto(s) com {labelPreview.quantity} etiqueta(s) cada.
                </DialogDescription>
              </DialogHeader>
              <ZPLPreview
                zpl={labelPreview.zpl}
                items={labelPreview.items}
                widthMm={labelPreview.widthMm}
                heightMm={labelPreview.heightMm}
                columns={labelPreview.columns}
                columnGapMm={labelPreview.columnGapMm}
                fileName={labelPreview.items[0]?.sku ? `labels-${labelPreview.items[0].sku}` : undefined}
                note={`Layout ${labelPreview.columns} colunas (${labelPreview.widthMm} x ${labelPreview.heightMm} mm por etiqueta). Use drivers Zebra compativeis com ZPL em 203 dpi.`}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}





































































