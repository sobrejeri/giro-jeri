# Logos dos adquirentes

Arquivos que o botão de pagamento carrega em `CheckoutPayment.jsx`:

| Arquivo           | Onde aparece                        |
|-------------------|-------------------------------------|
| `mercadopago.svg` | botão "Pagar com Mercado Pago"      |
| `pagarme.svg`     | botão "Pagar com cartão" (Pagar.me) |

## Por que este README existe em vez dos arquivos

São marcas de terceiros. O certo é usar o asset **oficial** de cada um, baixado
do brand kit deles — um logo desenhado "parecido" fica visivelmente errado e
ainda é uso indevido de marca registrada.

## Como colocar

1. Baixe o SVG oficial:
   - Mercado Pago: <https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/credits/banners>
     (ou a marca em <https://www.mercadolibre.com/brand>)
   - Pagar.me: <https://pagar.me> → rodapé → Imprensa / Marca
2. Salve **nesta pasta**, com exatamente o nome da tabela acima.
3. Pronto — nenhuma mudança de código. Faça o build e publique.

## O que acontece enquanto o arquivo não está aqui

Nada quebra. O `<img>` recebe 404, o `onError` esconde a imagem e o botão
continua inteiro, com a cor oficial e o texto. Foi feito assim de propósito:
um `import` de arquivo ausente derrubaria o build inteiro do Vite.

## Tamanho

O botão renderiza com `height: 20px` e largura automática. Um SVG horizontal
(marca + nome) fica melhor que só o símbolo.
