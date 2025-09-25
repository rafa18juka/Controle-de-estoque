export const currency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const formatDay = (input: string | Date) =>
  new Date(input).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
