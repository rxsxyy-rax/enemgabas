# EnemGabas

Site simples para consultar gabaritos **extraoficiais** do Enem, organizados por ano e caderno.

## Como rodar

```bash
npm install
npm start
```

Acesse <http://localhost:3000> (ou defina a porta com a variável `PORT`).

## Estrutura

- `app.js` — servidor Express
- `views/` — páginas HTML (`index.html` e uma por ano, ex.: `2026.html`)
- `data/` — gabaritos em JSON (`2026.json`) e o script que os renderiza (`processing.js`)
- `assets/` — estilos

## Adicionando um novo ano

1. Crie `data/<ano>.json` seguindo o formato de `data/2026.json`.
2. Copie `views/template.html` para `views/<ano>.html` e aponte o `data-json` para o novo arquivo.
3. A página fica disponível em `/<ano>`.

## Aviso

Os gabaritos são extraoficiais. Confira sempre o gabarito oficial divulgado pelo INEP.

## Licença

[MIT](LICENSE)
