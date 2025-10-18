"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Palette, Plus, Target, Trash2, Undo2, Users } from "lucide-react";

import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  createTaskAssignment,
  createTaskOption,
  deleteTaskAssignment,
  deleteTaskOption,
  fetchMovementUsers,
  fetchTaskMetadata,
  fetchTasksForAdmin,
  fetchTasksForUser,
  getProductBySku,
  updateTaskStatus,
  type MovementUserOption,
  type NewTaskAssignmentInput,
  type TaskMetadata,
  type TaskQueryOptions
} from "@/lib/firestore";
import type { AppUser, TaskAssignment, TaskOption, TaskOptionType, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const COLOR_PRESETS = ["#0F172A", "#1E3A8A", "#047857", "#BE123C", "#854D0E", "#7C3AED", "#0891B2", "#B91C1C"];
const ASSIGN_TO_ALL_VALUE = "__ALL_TEAM__";

const DEFAULT_FORM_STATE = {
  userId: "",
  taskOptionId: "",
  taskLabel: "",
  platformId: "",
  accountId: "",
  productSku: "",
  productId: "",
  productName: "",
  notes: "",
  dueDate: ""
};

type StatusFilter = TaskStatus | "all";

export default function TasksPage() {
  return (
    <ProtectedRoute>
      <TasksContent />
    </ProtectedRoute>
  );
}

interface DashboardSummary {
  total: number;
  pending: number;
  completed: number;
  overdue: number;
  completionRate: number;
  topUsers: Array<{ name: string; pending: number }>;
  topPlatforms: Array<{ label: string; count: number }>;
}

function AdminDashboard({ summary }: { summary: DashboardSummary }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <SummaryCard
        title="Tarefas totais"
        value={summary.total}
        helper={`${summary.completed} concluidas`}
        icon={<Users className="h-4 w-4" />}
      />
      <SummaryCard
        title="Pendentes"
        value={summary.pending}
        helper={`${summary.overdue} atrasadas`}
        icon={<AlertTriangle className="h-4 w-4" />}
        tone="amber"
      />
      <SummaryCard
        title="Taxa de conclusao"
        value={`${summary.completionRate}%`}
        helper="Ultimos 30 dias"
        icon={<CheckCircle2 className="h-4 w-4" />}
        tone="emerald"
      />
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plataformas ativas</h3>
        <div className="mt-3 space-y-2">
          {summary.topPlatforms.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhuma plataforma vinculada ainda.</p>
          ) : (
            summary.topPlatforms.map((item) => (
              <div key={item.label} className="flex items-center justify-between text-sm text-slate-600">
                <span>{item.label}</span>
                <span className="font-semibold text-slate-900">{item.count}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:col-span-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Colaboradores com mais pendencias</h3>
        <div className="mt-3 space-y-2">
          {summary.topUsers.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum colaborador com pendencias.</p>
          ) : (
            summary.topUsers.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{item.name}</span>
                <span className="font-semibold text-slate-900">{item.pending} pendentes</span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function SummaryCard({
  title,
  value,
  helper,
  icon,
  tone = "slate"
}: {
  title: string;
  value: string | number;
  helper?: string;
  icon: ReactNode;
  tone?: "slate" | "emerald" | "amber";
}) {
  const toneClasses =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-600";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium", toneClasses)}>
        {icon}
        {title}
      </div>
      <div className="mt-4 text-3xl font-semibold text-slate-900">{value}</div>
      {helper ? <p className="mt-2 text-sm text-slate-500">{helper}</p> : null}
    </div>
  );
}

interface PersonalSummary {
  total: number;
  pending: number;
  completed: number;
  overdue: number;
  upcoming: number;
  completionRate: number;
}

function PersonalDashboard({ summary }: { summary: PersonalSummary }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryCard title="Tarefas pendentes" value={summary.pending} helper="Mantenha o foco nas prioridades" icon={<Target className="h-4 w-4" />} />
      <SummaryCard
        title="Concluidas"
        value={summary.completed}
        helper={`Conclusao geral: ${summary.completionRate}%`}
        icon={<CheckCircle2 className="h-4 w-4" />}
        tone="emerald"
      />
      <SummaryCard
        title="Atrasadas"
        value={summary.overdue}
        helper={summary.overdue > 0 ? "Resolva estas primeiro" : "Tudo em dia!"}
        icon={<AlertTriangle className="h-4 w-4" />}
        tone="amber"
      />
      <SummaryCard
        title="Proximos prazos"
        value={summary.upcoming}
        helper="Nos proximos 3 dias"
        icon={<Clock3 className="h-4 w-4" />}
      />
    </section>
  );
}

function ColoredBadge({ label, color }: { label: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color ?? "#0F172A" }} />
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const classes =
    status === "completed"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : status === "archived"
        ? "bg-slate-100 text-slate-500 border-slate-200"
        : "bg-amber-50 text-amber-700 border-amber-100";
  const label = status === "completed" ? "Concluida" : status === "archived" ? "Arquivada" : "Pendente";
  return <span className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold", classes)}>{label}</span>;
}

function computeAdminSummary(tasks: TaskAssignment[]): DashboardSummary {
  const total = tasks.length;
  const pending = tasks.filter((task) => task.status === "pending").length;
  const completed = tasks.filter((task) => task.status === "completed").length;
  const overdue = tasks.filter((task) => isTaskOverdue(task)).length;
  const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100);

  const userMap = new Map<string, { name: string; pending: number }>();
  tasks.forEach((task) => {
    if (task.status !== "pending") {
      return;
    }
    const current = userMap.get(task.userId) ?? { name: task.userName, pending: 0 };
    current.pending += 1;
    userMap.set(task.userId, current);
  });
  const topUsers = Array.from(userMap.values())
    .sort((a, b) => b.pending - a.pending)
    .slice(0, 4);

  const platformMap = new Map<string, number>();
  tasks.forEach((task) => {
    if (!task.platformLabel) {
      return;
    }
    platformMap.set(task.platformLabel, (platformMap.get(task.platformLabel) ?? 0) + 1);
  });
  const topPlatforms = Array.from(platformMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  return {
    total,
    pending,
    completed,
    overdue,
    completionRate,
    topUsers,
    topPlatforms
  };
}

function computePersonalSummary(tasks: TaskAssignment[]): PersonalSummary {
  const total = tasks.length;
  const pending = tasks.filter((task) => task.status === "pending").length;
  const completed = tasks.filter((task) => task.status === "completed").length;
  const overdue = tasks.filter((task) => isTaskOverdue(task)).length;
  const upcoming = tasks.filter((task) => task.status === "pending" && isTaskDueSoon(task)).length;
  const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100);

  return {
    total,
    pending,
    completed,
    overdue,
    upcoming,
    completionRate
  };
}

function isTaskOverdue(task: TaskAssignment): boolean {
  if (!task.dueDate) {
    return false;
  }
  if (task.status !== "pending") {
    return false;
  }
  return task.dueDate < Date.now();
}

function isTaskDueSoon(task: TaskAssignment): boolean {
  if (!task.dueDate) {
    return false;
  }
  if (task.status !== "pending") {
    return false;
  }
  const now = Date.now();
  const diff = task.dueDate - now;
  const threeDays = 1000 * 60 * 60 * 24 * 3;
  return diff > 0 && diff <= threeDays;
}

function formatDate(value: number | string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

interface TaskOptionManagerProps {
  type: TaskOptionType;
  title: string;
  description: string;
  icon: ReactNode;
  options: TaskOption[];
  loading: boolean;
  onRefresh: () => Promise<void> | void;
}

function TaskOptionManager({ type, title, description, icon, options, loading, onRefresh }: TaskOptionManagerProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Informe um nome para adicionar ao catalogo.");
      return;
    }
    setSubmitting(true);
    try {
      await createTaskOption(type, { name, color });
      toast.success("Item adicionado com sucesso.");
      setName("");
      setColor(COLOR_PRESETS[Math.floor(Math.random() * COLOR_PRESETS.length)]);
      await onRefresh();
    } catch (error) {
      console.error("Erro ao criar item do catalogo", error);
      toast.error("Nao foi possivel adicionar este item.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteTaskOption(id);
      toast.success("Item removido.");
      await onRefresh();
    } catch (error) {
      console.error("Erro ao excluir item do catalogo", error);
      toast.error("Nao foi possivel excluir este item.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white">{icon}</div>
        <div>
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Input
          placeholder="Nome"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full lg:flex-1 lg:min-w-[240px]"
        />
        <div className="flex flex-wrap items-center gap-2 lg:flex-none">
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="h-10 w-12 cursor-pointer rounded-md border border-slate-200 p-0"
          />
          <div className="flex gap-1 lg:flex-none">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={cn(
                  "h-6 w-6 rounded-full border border-slate-200 transition",
                  preset === color ? "ring-2 ring-offset-1 ring-slate-900" : "hover:scale-110"
                )}
                style={{ backgroundColor: preset }}
                onClick={() => setColor(preset)}
                aria-label={`Selecionar cor ${preset}`}
              />
            ))}
          </div>
        </div>
        <Button onClick={handleCreate} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span className="ml-2">Adicionar</span>
        </Button>
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Carregando itens...
          </div>
        ) : options.length === 0 ? (
          <p className="text-xs text-slate-500">Nenhum item cadastrado ainda.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <span
                key={option.id}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: option.color }} />
                {option.name}
                <button
                  type="button"
                  onClick={() => handleDelete(option.id)}
                  className="text-rose-500 transition hover:text-rose-600"
                  aria-label={`Remover ${option.name}`}
                >
                  {deletingId === option.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface StaffTasksViewProps {
  user: AppUser;
}

function StaffTasksView({ user }: StaffTasksViewProps) {
  const [tasks, setTasks] = useState<TaskAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchTasksForUser(user.uid);
      setTasks(result);
    } catch (error) {
      console.error("Erro ao carregar tarefas do colaborador", error);
      toast.error("Nao foi possivel carregar suas tarefas.");
    } finally {
      setLoading(false);
    }
  }, [user.uid]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const summary = useMemo(() => computePersonalSummary(tasks), [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => (statusFilter === "all" ? true : task.status === statusFilter));
  }, [statusFilter, tasks]);

  const handleToggle = async (task: TaskAssignment) => {
    const nextStatus: TaskStatus = task.status === "completed" ? "pending" : "completed";
    setProcessingId(task.id);
    try {
      await updateTaskStatus(task.id, nextStatus);
      toast.success(nextStatus === "completed" ? "Parabens! Tarefa concluida." : "Tarefa reaberta.");
      loadTasks();
    } catch (error) {
      console.error("Erro ao atualizar tarefa do colaborador", error);
      toast.error("Nao foi possivel atualizar a tarefa.");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Minhas tarefas</h1>
        <p className="text-sm text-slate-600">Acompanhe seus entregaveis, conclua tarefas e mantenha o foco no que importa.</p>
      </header>

      <PersonalDashboard summary={summary} />

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Sua fila de tarefas</h2>
            <p className="text-xs text-slate-500">Clique em concluir assim que terminar cada item.</p>
          </div>
        <div className="flex gap-2">
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="pending">Pendentes</option>
              <option value="all">Todas</option>
              <option value="completed">Concluidas</option>
            </Select>
            <Button variant="outline" size="sm" onClick={loadTasks} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando tarefas...
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 py-10 text-center text-sm text-slate-500">
              Nenhuma tarefa nessa categoria. Aproveite para revisar suas atividades anteriores ou planejar os proximos passos.
            </div>
          ) : (
            filteredTasks.map((task) => {
              const overdue = isTaskOverdue(task);
              const dueSoon = isTaskDueSoon(task);
              return (
                <div key={task.id} className="rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <ColoredBadge label={task.taskLabel} color={task.taskColor} />
                        <StatusBadge status={task.status} />
                      </div>
                      {task.notes ? <p className="text-sm text-slate-600">{task.notes}</p> : null}
                      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                        {task.productName ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
                            <Target className="h-3 w-3" />
                            {task.productName}
                          </span>
                        ) : null}
                        {task.productSku ? (
                          <span className="font-mono uppercase text-slate-400">SKU: {task.productSku}</span>
                        ) : null}
                        {task.platformLabel ? (
                          <ColoredBadge label={task.platformLabel} color={task.platformColor} />
                        ) : null}
                        {task.accountLabel ? (
                          <ColoredBadge label={task.accountLabel} color={task.accountColor} />
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                        <span>Designado por {task.assignedByName}</span>
                        {task.createdAt ? <span>Recebida em {formatDate(task.createdAt)}</span> : null}
                      </div>
                    </div>
                    <div className="flex w-full flex-col items-stretch gap-2 sm:w-40">
                      {task.dueDate ? (
                        <div
                          className={cn(
                            "rounded-lg px-3 py-2 text-xs font-medium",
                            overdue
                              ? "bg-rose-100 text-rose-700"
                              : dueSoon
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                          )}
                        >
                          Prazo: {formatDate(task.dueDate)}
                        </div>
                      ) : (
                        <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-500">Sem prazo definido</div>
                      )}
                      <Button
                        variant={task.status === "completed" ? "outline" : "default"}
                        className="gap-2"
                        onClick={() => handleToggle(task)}
                        disabled={processingId === task.id}
                      >
                        {processingId === task.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : task.status === "completed" ? (
                          <Undo2 className="h-4 w-4" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        {task.status === "completed" ? "Reabrir" : "Concluir"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
function TasksContent() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return user.role === "admin" ? <AdminTasksView user={user} /> : <StaffTasksView user={user} />;
}

interface AdminTasksViewProps {
  user: AppUser;
}

function AdminTasksView({ user }: AdminTasksViewProps) {
  const [metadata, setMetadata] = useState<TaskMetadata>({ tasks: [], platforms: [], accounts: [] });
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskAssignment[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [users, setUsers] = useState<MovementUserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [filters, setFilters] = useState<{ status: StatusFilter; userId: string }>({ status: "pending", userId: "all" });
  const [assignmentForm, setAssignmentForm] = useState(DEFAULT_FORM_STATE);
  const [creatingTask, setCreatingTask] = useState(false);
  const [productLookupLoading, setProductLookupLoading] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  const loadMetadata = useCallback(async () => {
    setMetadataLoading(true);
    try {
      const result = await fetchTaskMetadata();
      setMetadata(result);
    } catch (error) {
      console.error("Erro ao carregar catalogos de tarefas", error);
      toast.error("Nao foi possivel carregar os itens de tarefas.");
    } finally {
      setMetadataLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const result = await fetchMovementUsers();
      const sorted = [...result].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
      setUsers(sorted);
    } catch (error) {
      console.error("Erro ao carregar usuarios para tarefas", error);
      toast.error("Falha ao obter a lista de usuarios.");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadTasks = useCallback(
    async (options?: TaskQueryOptions) => {
      setTasksLoading(true);
      try {
        const result = await fetchTasksForAdmin(options);
        setTasks(result);
      } catch (error) {
        console.error("Erro ao carregar tarefas", error);
        toast.error("Nao foi possivel carregar as tarefas.");
      } finally {
        setTasksLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadMetadata();
    loadUsers();
    loadTasks();
  }, [loadMetadata, loadTasks, loadUsers]);

  const handleFormChange = (field: keyof typeof DEFAULT_FORM_STATE, value: string) => {
    setAssignmentForm((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSelectTaskOption = (value: string) => {
    const selected = metadata.tasks.find((item) => item.id === value);
    setAssignmentForm((prev) => ({
      ...prev,
      taskOptionId: value,
      taskLabel: prev.taskLabel ? prev.taskLabel : selected?.name ?? ""
    }));
  };

  const handleLookupProduct = async () => {
    const sku = assignmentForm.productSku.trim();
    if (!sku) {
      toast.error("Informe um SKU para pesquisar o produto.");
      return;
    }
    setProductLookupLoading(true);
    try {
      const product = await getProductBySku(sku);
      if (!product) {
        toast.error("Produto nao encontrado para este SKU.");
        setAssignmentForm((prev) => ({ ...prev, productId: "", productName: "" }));
        return;
      }
      setAssignmentForm((prev) => ({
        ...prev,
        productId: product.id,
        productSku: product.sku,
        productName: product.name ?? ""
      }));
      toast.success("Produto vinculado a tarefa.");
    } catch (error) {
      console.error("Erro ao buscar produto", error);
      toast.error("Nao foi possivel localizar o produto.");
    } finally {
      setProductLookupLoading(false);
    }
  };

  const resetForm = () => {
    setAssignmentForm(DEFAULT_FORM_STATE);
  };

  const handleCreateTask = async () => {
    if (!assignmentForm.userId) {
      toast.error("Selecione o funcionario que recebera a tarefa.");
      return;
    }
    if (!assignmentForm.taskOptionId && !assignmentForm.taskLabel.trim()) {
      toast.error("Defina o tipo de tarefa ou informe um titulo.");
      return;
    }

    const selectedTaskOption = metadata.tasks.find((item) => item.id === assignmentForm.taskOptionId);
    const selectedPlatform = metadata.platforms.find((item) => item.id === assignmentForm.platformId);
    const selectedAccount = metadata.accounts.find((item) => item.id === assignmentForm.accountId);
    const isBroadcast = assignmentForm.userId === ASSIGN_TO_ALL_VALUE;
    const targetUsers = isBroadcast
      ? users.filter((option) => option.role !== "admin")
      : users.filter((option) => option.id === assignmentForm.userId);

    if (targetUsers.length === 0) {
      toast.error("Nao foi possivel identificar os colaboradores selecionados.");
      return;
    }

    setCreatingTask(true);
    try {
      for (const target of targetUsers) {
        const payload: NewTaskAssignmentInput = {
          taskOptionId: selectedTaskOption?.id ?? null,
          taskLabel: assignmentForm.taskLabel || selectedTaskOption?.name || "Nova tarefa",
          taskColor: selectedTaskOption?.color ?? null,
          platformId: selectedPlatform?.id ?? null,
          platformLabel: selectedPlatform?.name ?? null,
          platformColor: selectedPlatform?.color ?? null,
          accountId: selectedAccount?.id ?? null,
          accountLabel: selectedAccount?.name ?? null,
          accountColor: selectedAccount?.color ?? null,
          productId: assignmentForm.productId || null,
          productSku: assignmentForm.productSku || null,
          productName: assignmentForm.productName || null,
          userId: target.id,
          userName: target.name ?? target.email ?? "",
          assignedById: user.uid,
          assignedByName: user.displayName ?? user.email ?? "admin",
          notes: assignmentForm.notes || null,
          dueDate: assignmentForm.dueDate ? new Date(`${assignmentForm.dueDate}T12:00:00`) : null
        };
        await createTaskAssignment(payload);
      }
      const successMessage = isBroadcast
        ? `Tarefa atribuida para ${targetUsers.length} colaboradores.`
        : "Tarefa atribuida com sucesso.";
      toast.success(successMessage);
      resetForm();
      loadTasks({ status: filters.status !== "all" ? filters.status : undefined, assignedTo: filters.userId });
    } catch (error) {
      console.error("Erro ao criar tarefa", error);
      toast.error("Nao foi possivel criar a tarefa.");
    } finally {
      setCreatingTask(false);
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filters.status !== "all" && task.status !== filters.status) {
        return false;
      }
      if (filters.userId !== "all" && filters.userId && task.userId !== filters.userId) {
        return false;
      }
      return true;
    });
  }, [filters, tasks]);

  const adminSummary = useMemo(() => computeAdminSummary(tasks), [tasks]);

  const handleStatusToggle = async (task: TaskAssignment) => {
    const nextStatus: TaskStatus = task.status === "completed" ? "pending" : "completed";
    setUpdatingTaskId(task.id);
    try {
      await updateTaskStatus(task.id, nextStatus);
      toast.success(nextStatus === "completed" ? "Tarefa concluida." : "Tarefa reaberta.");
      loadTasks({ status: filters.status !== "all" ? filters.status : undefined, assignedTo: filters.userId });
    } catch (error) {
      console.error("Erro ao atualizar status da tarefa", error);
      toast.error("Nao foi possivel atualizar o status da tarefa.");
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setDeletingTaskId(taskId);
    try {
      await deleteTaskAssignment(taskId);
      toast.success("Tarefa removida.");
      loadTasks({ status: filters.status !== "all" ? filters.status : undefined, assignedTo: filters.userId });
    } catch (error) {
      console.error("Erro ao remover tarefa", error);
      toast.error("Nao foi possivel remover a tarefa.");
    } finally {
      setDeletingTaskId(null);
    }
  };

  const handleFilterChange = (update: Partial<typeof filters>) => {
    setFilters((prev) => ({ ...prev, ...update }));
  };

  useEffect(() => {
    const options: TaskQueryOptions = {};
    if (filters.status !== "all") {
      options.status = filters.status;
    }
    if (filters.userId !== "all") {
      options.assignedTo = filters.userId;
    }
    loadTasks(options);
  }, [filters.status, filters.userId, loadTasks]);

  return (
    <div className="flex flex-col gap-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Central de Tarefas</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          Crie tarefas conectadas aos produtos, defina plataformas e contas especificas e acompanhe o progresso da equipe em tempo real.
        </p>
      </header>

      <AdminDashboard summary={adminSummary} />

      <section className="grid gap-6 lg:grid-cols-[2fr,3fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Designar nova tarefa</h2>
                <p className="text-xs text-slate-500">Selecione o colaborador, defina a tarefa e vincule um produto.</p>
              </div>
              <Button variant="outline" size="sm" onClick={resetForm}>
                Limpar
              </Button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="grid gap-3">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Colaborador</label>
                <Select
                  value={assignmentForm.userId}
                  onChange={(event) => handleFormChange("userId", event.target.value)}
                  disabled={usersLoading}
                >
                  <option value="">Selecione um colaborador</option>
                  <option value={ASSIGN_TO_ALL_VALUE}>Todos os colaboradores</option>
                  {users.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} {option.role === "admin" ? "(Admin)" : ""}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-3">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Tipo da tarefa</label>
                <Select value={assignmentForm.taskOptionId} onChange={(event) => handleSelectTaskOption(event.target.value)} disabled={metadataLoading}>
                  <option value="">Selecione no catalogo</option>
                  {metadata.tasks.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-3">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Titulo da tarefa</label>
                <Input
                  placeholder="Ex.: Revisar fotos do catalogo"
                  value={assignmentForm.taskLabel}
                  onChange={(event) => handleFormChange("taskLabel", event.target.value)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-3">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Plataforma</label>
                  <Select
                    value={assignmentForm.platformId}
                    onChange={(event) => handleFormChange("platformId", event.target.value)}
                    disabled={metadataLoading}
                  >
                    <option value="">Opcional</option>
                    {metadata.platforms.map((option) => (
                      <option value={option.id} key={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-3">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Conta</label>
                  <Select
                    value={assignmentForm.accountId}
                    onChange={(event) => handleFormChange("accountId", event.target.value)}
                    disabled={metadataLoading}
                  >
                    <option value="">Opcional</option>
                    {metadata.accounts.map((option) => (
                      <option value={option.id} key={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="grid gap-3">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Produto</label>
                <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="SKU do produto"
                      value={assignmentForm.productSku}
                      onChange={(event) => handleFormChange("productSku", event.target.value.toUpperCase())}
                      className="uppercase"
                    />
                    <Button variant="outline" onClick={handleLookupProduct} disabled={productLookupLoading}>
                      {productLookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
                    </Button>
                  </div>
                  {assignmentForm.productName ? (
                    <div className="rounded-md bg-slate-100 px-3 py-2 text-xs">
                      <div className="font-medium text-slate-700">{assignmentForm.productName}</div>
                      <div className="font-mono uppercase text-slate-500">SKU: {assignmentForm.productSku}</div>
                    </div>
                  ) : (
                    <Input
                      placeholder="Nome do produto (opcional)"
                      value={assignmentForm.productName}
                      onChange={(event) => handleFormChange("productName", event.target.value)}
                    />
                  )}
                </div>
              </div>

              <div className="grid gap-3">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Notas / instrucoes</label>
                <textarea
                  rows={3}
                  placeholder="Detalhes adicionais para o colaborador"
                  value={assignmentForm.notes}
                  onChange={(event) => handleFormChange("notes", event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700"
                />
              </div>

              <div className="grid gap-3">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Prazo (opcional)</label>
                <Input
                  type="date"
                  value={assignmentForm.dueDate}
                  onChange={(event) => handleFormChange("dueDate", event.target.value)}
                />
              </div>

              <Button className="w-full gap-2" onClick={handleCreateTask} disabled={creatingTask}>
                {creatingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Enviar tarefa
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900">Catalogos de tarefas</h2>
            <p className="text-xs text-slate-500">Gerencie os blocos reutilizaveis de tarefas, plataformas e contas.</p>

            <div className="mt-5 space-y-5">
              <TaskOptionManager
                title="Tipos de tarefa"
                description="Padroes como Revisar fotos, Criar videos, Atualizar descricoes."
                icon={<Target className="h-4 w-4" />}
                type="task"
                options={metadata.tasks}
                loading={metadataLoading}
                onRefresh={loadMetadata}
              />
              <TaskOptionManager
                title="Plataformas"
                description="Marketplace ou canal de atuacao (Mercado Livre, Shopee, Amazon...)."
                icon={<Users className="h-4 w-4" />}
                type="platform"
                options={metadata.platforms}
                loading={metadataLoading}
                onRefresh={loadMetadata}
              />
              <TaskOptionManager
                title="Contas"
                description="Contas especificas ou lojas virtuais vinculadas."
                icon={<Palette className="h-4 w-4" />}
                type="account"
                options={metadata.accounts}
                loading={metadataLoading}
                onRefresh={loadMetadata}
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Fila de tarefas</h2>
                <p className="text-xs text-slate-500">Filtre por status, colaborador e acompanhe cada etapa.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={filters.status}
                  onChange={(event) => handleFilterChange({ status: event.target.value as StatusFilter })}
                >
                  <option value="all">Todos os status</option>
                  <option value="pending">Pendentes</option>
                  <option value="completed">Concluidas</option>
                  <option value="archived">Arquivadas</option>
                </Select>
                <Select
                  value={filters.userId}
                  onChange={(event) => handleFilterChange({ userId: event.target.value })}
                >
                  <option value="all">Todos os colaboradores</option>
                  {users.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Tarefa</th>
                    <th className="px-4 py-3 text-left">Produto</th>
                    <th className="px-4 py-3 text-left">Responsavel</th>
                    <th className="px-4 py-3 text-left">Contexto</th>
                    <th className="px-4 py-3 text-left">Prazo</th>
                    <th className="px-4 py-3 text-right">Status</th>
                    <th className="px-4 py-3 text-right">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tasksLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Carregando tarefas...
                        </div>
                      </td>
                    </tr>
                  ) : filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                        Nenhuma tarefa encontrada com os filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    filteredTasks.map((task) => {
                      const overdue = isTaskOverdue(task);
                      const dueSoon = isTaskDueSoon(task);
                      return (
                        <tr key={task.id} className="text-slate-700">
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <ColoredBadge label={task.taskLabel} color={task.taskColor} />
                              </div>
                              {task.notes ? <p className="text-xs text-slate-500">{task.notes}</p> : null}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {task.productName ? (
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-slate-800">{task.productName}</span>
                                {task.productSku ? (
                                  <span className="font-mono text-xs uppercase text-slate-500">SKU: {task.productSku}</span>
                                ) : null}
                              </div>
                            ) : task.productSku ? (
                              <span className="font-mono text-xs uppercase text-slate-500">{task.productSku}</span>
                            ) : (
                              <span className="text-xs text-slate-400">Sem produto</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-slate-800">{task.userName}</div>
                            <div className="text-xs text-slate-400">Designado por {task.assignedByName}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              {task.platformLabel ? (
                                <ColoredBadge label={task.platformLabel} color={task.platformColor} />
                              ) : null}
                              {task.accountLabel ? (
                                <ColoredBadge label={task.accountLabel} color={task.accountColor} />
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {task.dueDate ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 text-xs text-slate-600">
                                  <Clock3 className="h-3.5 w-3.5" />
                                  {formatDate(task.dueDate)}
                                </div>
                                {overdue ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600">
                                    <AlertTriangle className="h-3 w-3" />
                                    Atrasada
                                  </span>
                                ) : dueSoon ? (
                                  <span className="text-xs font-medium text-amber-600">Prazo se aproximando</span>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">Sem prazo</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <StatusBadge status={task.status} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleStatusToggle(task)}
                                disabled={updatingTaskId === task.id}
                                title={task.status === "completed" ? "Reabrir tarefa" : "Concluir tarefa"}
                              >
                                {updatingTaskId === task.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : task.status === "completed" ? (
                                  <Undo2 className="h-4 w-4" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                onClick={() => handleDeleteTask(task.id)}
                                disabled={deletingTaskId === task.id}
                                title="Excluir tarefa"
                              >
                                {deletingTaskId === task.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
