# Copa das Colmeias - Painel TV

Frontend externo em Next.js para exibir o placar ao vivo da Copa das Colmeias em uma TV do escritorio.

## O que esta incluso

- Painel 16:9 em estilo broadcast esportivo.
- Topo com status ao vivo e horario de atualizacao.
- Dois cards de semifinal.
- Painel lateral com Top 10 geral.
- Ticker inferior de ranking geral.
- Animacao de GOL automatica quando o placar de alguma loja aumenta.
- API route `/api/placar` para consumir o Apps Script no servidor e evitar problema de CORS.
- Fallback com dados mockados caso a URL do Apps Script ainda nao esteja configurada.

## Arquitetura

```txt
Google Sheets
     ↓
Apps Script Web App
     ↓ JSON
Vercel / Next.js
     ↓
TV do escritorio
```

O navegador da TV acessa o frontend externo. O frontend consulta `/api/placar`. Essa rota roda no servidor da Vercel e busca os dados no Apps Script.

## Rodando localmente

```bash
npm install
npm run dev
```

Abra:

```txt
http://localhost:3000
```

Sem `APPS_SCRIPT_URL`, o painel usa dados de exemplo.

## Configurando dados reais

1. No Apps Script, cole o arquivo `apps-script/Code.gs` no projeto que ja le a planilha da Copa.
2. Publique como Web App.
3. Configure a permissao de acesso do Web App conforme sua politica interna.
4. Copie a URL final e adicione `?api=placar`.
5. No Vercel, crie a variavel de ambiente:

```txt
APPS_SCRIPT_URL=https://script.google.com/macros/s/SEU_ID/exec?api=placar
```

Opcional:

```txt
NEXT_PUBLIC_POLL_MS=15000
```

## Como funciona a animacao de gol

A tela consulta os dados a cada 15 segundos por padrao. O frontend compara o placar novo com o placar anterior salvo no `localStorage` da TV.

Se detectar que algum lado aumentou o numero de contratos, exibe:

```txt
GOL!
[Loja] marca!
PLACAR: X X Y
```

A animacao dura aproximadamente 6,8 segundos e depois volta para o painel.

Para testar manualmente no navegador, pressione a tecla `G`.

## Deploy na Vercel

Rota recomendada:

1. Subir esta pasta para um repositorio GitHub.
2. Importar o repositorio na Vercel.
3. Adicionar as variaveis de ambiente.
4. Fazer o deploy.
5. Abrir a URL final na TV em tela cheia.

## Observacao importante

A imagem gerada por IA e o HTML/CSS nao ficam pixel-perfect de forma confiavel. Este projeto recria a direcao visual com layout real, dados dinamicos e animacao. Se a exigencia for congelar exatamente a imagem do prototipo, o caminho seria usar a imagem como background e sobrepor textos, mas isso e menos robusto para operacao real.
