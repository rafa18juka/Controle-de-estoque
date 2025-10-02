# Plano de Testes – Kits de SKU

## Pré-requisitos

- `NEXT_PUBLIC_ENABLE_KIT_SKU=true` configurado e app reiniciado.
- Usuário admin logado para gerenciar estoque; usuário staff para validar scanner.
- Pelo menos um produto de estoque disponível para ser usado como "pai".

## Fluxos de cadastro/edição

1. **Criar kit a partir do modal de novo produto**
   - Abrir `Admin › Estoque` → botão “Novo produto”.
   - Preencher dados básicos + adicionar kit no bloco “Kits”.
   - Salvar e verificar que o produto aparece com o kit expandido.
2. **Adicionar kit em produto existente**
   - Expandir linha do produto → “Adicionar kit”.
   - Informar label/SKU/multiplicador. Validações esperadas:
     - SKU não pode ser vazio.
     - Multiplicador mínimo 1.
     - SKU não pode colidir com produto pai nem com outros kits ou produtos.
3. **Editar kit**
   - Ação “Editar” → alterar label e multiplicador → salvar.
4. **Excluir kit**
   - Ação “Excluir” → confirmar → kit some da listagem.
5. **Persistência estado expandido**
   - Expandir alguns produtos, navegar para outra tela e voltar → estado deve ser preservado.

## Fluxos do scanner

1. **SKU pai**
   - `app/scan` → informar SKU do produto pai → baixa 1 unidade → histórico registra `scannedSku` igual ao SKU pai, `multiplier=1`.
2. **SKU kit (multiplicador default)**
   - Escanear kit recém-criado → baixa `multiplicador` unidades do pai → UI exibe mensagem "Kit ... baixou X".
3. **SKU kit com quantidade manual**
   - Informar quantidade 2 antes de escanear → estoque reduz `2 × multiplicador`.
4. **Estoque insuficiente**
   - Ajustar quantidade do pai abaixo do necessário → escanear kit → mensagem "Estoque insuficiente".
5. **Produto sem estoque (inativo)**
   - Forçar quantidade 0 → escanear kit → operação bloqueada igual fluxo anterior.
6. **Histórico**
   - Verificar `Admin › Historico`: colunas “SKU pai”, “SKU escaneado”, “Multiplicador” preenchidas corretamente, inclusive no CSV exportado.

## Geração de etiquetas

1. **Label de produto**
   - Selecionar produto pai → “Gerar etiquetas” → comportamento existente permanece.
2. **Label de kit**
   - Expandir produto → ação “Etiqueta” no kit → preview apresenta SKU do kit e nome.

## Regras e segurança

1. **Rules Firestore para admin**
   - Criar/editar kit com multiplicador inválido (pelo devtools) → operação deve ser rejeitada.
   - Tentar gravar kit sem `kitSkus` consistente → rejeitado.
2. **Staff**
   - Tentar editar campos de kit via Firestore (ex.: atualizar documento diretamente) → bloqueado (staff só pode alterar `quantity/totalValue`).

## Regressões

1. CRUD de produtos sem kits continua funcionado (criar produto sem kits, editar campos, excluir).
2. Importação/exportação JSON permanece idêntica (kits não interferem).
3. Tela de dashboard/histórico carregam sem erros mesmo quando não há kits.
