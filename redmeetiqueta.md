# Guia rápida - Etiquetas em ZPL (bobina dupla)

## Onde ajustar o layout

- Arquivo principal: `app/admin/estoque/page.tsx`
- Constantes logo no topo:
  ```ts
  const LABEL_WIDTH_MM = 40;
  const LABEL_HEIGHT_MM = 25;
  const LABEL_COLUMNS = 2;
  const LABEL_COLUMN_GAP_MM = 3;
  ```
  - `LABEL_WIDTH_MM`: largura de **cada etiqueta individual** (mm)
  - `LABEL_HEIGHT_MM`: altura da etiqueta (mm)
  - `LABEL_COLUMNS`: quantas etiquetas imprimir por linha (2 para bobina dupla)
  - `LABEL_COLUMN_GAP_MM`: espaço vazio entre as colunas (mm)

## Como testar rapidamente

1. Ajuste os valores acima e salve.
2. Gere uma etiqueta a partir da tela `/admin/estoque` (botão "Gerar etiquetas").
3. O modal de pré-visualização reflete imediatamente as alterações e salva o arquivo ZPL com o novo layout.

## Código que gera o ZPL

- Função: `generateZPL` em `lib/zpl.ts`
- Parâmetros relevantes:
  ```ts
  generateZPL({
    sku,
    name,
    unitPrice,
    widthMm: LABEL_WIDTH_MM,
    heightMm: LABEL_HEIGHT_MM,
    columns: LABEL_COLUMNS,
    columnGapMm: LABEL_COLUMN_GAP_MM
  });
  ```
- Se precisar de ajustes específicos (ex.: mover texto ou mudar fontes), edite as linhas dentro de `generateZPL` (cada `^FO` define posições em pontos).

## Dica para impressoras Zebra

- Sempre imprimir em 203 dpi (8 dots/mm).
- Certifique-se de que a largura total = `(largura * colunas) + (gap * (colunas - 1))` não ultrapassa a largura física da bobina.
- Se o código fugir da área, reduza `LABEL_WIDTH_MM` ou `LABEL_COLUMN_GAP_MM`.
