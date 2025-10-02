# Kits SKU

## Ativação

1. Defina a variável `NEXT_PUBLIC_ENABLE_KIT_SKU=true` no ambiente (por exemplo em `.env.local`).
2. Reinicie o servidor Next.js para que o flag seja propagado.
3. Com o flag desligado, todas as telas continuam usando o comportamento anterior (nenhum UI ou lógica de kits é exposta).

## Cadastro de kits

1. Acesse `Admin › Estoque` com usuários com permissão de administrador.
2. Expanda a linha do produto desejado clicando no ícone de chevron; se não houver kits, uma faixa “Nenhum kit cadastrado ainda” aparece.
3. Use o botão “Adicionar kit” para abrir o formulário. Informe nome (opcional), SKU e multiplicador.
4. Salve o kit. O SKU do kit não pode colidir com o SKU do produto pai, nem com SKUs de outros produtos/kits.
5. Para editar ou excluir um kit existente, use as ações exibidas na linha do kit.
6. Ao criar um novo produto, a seção “Kits” dentro do modal permite cadastrar kits antecipadamente (utiliza o mesmo validador).

## Impressão de etiquetas

1. Abra `Admin › Estoque` e expanda o produto desejado.
2. Na linha do kit use a ação “Etiqueta” para gerar a pré-visualização ZPL do kit individual.
3. Também é possível gerar etiquetas de kits a partir do botão principal “Gerar etiquetas”, selecionando apenas os produtos/rows desejados.
4. O fluxo reutiliza o mesmo preview (`ZPLPreview`) do produto pai; basta baixar o arquivo `.zpl` ou copiar o código para a impressora.

## Scanner

- Staff/Admin pode escanear tanto o SKU pai quanto o SKU do kit em `scan/`.
- Quando um kit é lido, o multiplicador é aplicado automaticamente (ex.: multiplicador 10 → baixa 10 unidades).
- O histórico passa a registrar `scannedSku`, multiplicador e quantidade efetiva.
