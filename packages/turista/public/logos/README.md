# Logos dos adquirentes

Arquivos que o botão de pagamento carrega em `CheckoutPayment.jsx`:

| Arquivo           | Estado    | Onde aparece                        |
|-------------------|-----------|-------------------------------------|
| `mercadopago.svg` | **existe**| botão "Pagar com Mercado Pago"      |
| `pagarme.svg`     | falta     | botão "Pagar com cartão" (Pagar.me) |

## De onde veio o `mercadopago.svg`

Do pacote [`simple-icons`](https://simpleicons.org) (npm), dedicado ao domínio
público sob **CC0-1.0**. É o símbolo do Mercado Pago em traço único, e o `fill`
foi gravado como `#FFFFFF` no arquivo.

O branco é gravado de propósito: o logo é carregado por `<img>`, e `<img>` **não
herda** a cor do botão — um `currentColor` ficaria preto sobre o azul. Este logo
só aparece sobre `#009EE3`, então branco é sempre o certo.

Se preferir a marca horizontal completa (símbolo + nome), baixe do brand kit do
Mercado Pago e substitua o arquivo mantendo o nome. Nenhuma mudança de código.

## Como colocar o do Pagar.me

1. Baixe o SVG oficial: <https://pagar.me> → rodapé → Imprensa / Marca
2. Salve nesta pasta como `pagarme.svg`
3. Build e publica — nenhuma mudança de código

O botão do Pagar.me é **branco com texto escuro**, então o logo dele deve ser
escuro (não use uma versão branca).

## O que acontece enquanto um arquivo não está aqui

Nada quebra. O `<img>` recebe 404, o `onError` esconde a imagem e o botão
continua inteiro, com a cor e o texto. Foi feito assim de propósito: um `import`
de arquivo ausente derrubaria o build inteiro do Vite.

## Tamanho

O botão renderiza com `height: 20px` e largura automática.
