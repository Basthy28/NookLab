# NookLab

Fork experimental do [Notesnook](https://github.com/streetwriters/notesnook), mantido por Basthy28.

As notas **não** são copiadas para outro sítio: o NookLab aponta para o **mesmo servidor** e usa a **mesma conta e chave de encriptação**. por isso as notas são idênticas entre a app oficial e o NookLab.

## Servidor

Instância self-hosted em `nooklab.duckdns.org` (Caddy + sync server, identity, sse, monograph, s3, mongo). `anotas.duckdns.org` aponta para o mesmo servidor e mantém-se como alias.

URLs derivadas do Caddyfile — **confirma em `Settings → Servers` na app que funciona** antes de as usar:

| Serviço | URL |
|---|---|
| Sync | `https://nooklab.duckdns.org/api` |
| Identity / Auth | `https://nooklab.duckdns.org/account` |
| SSE (eventos) | `https://nooklab.duckdns.org/sse` |
| Monograph | `https://nooklab.duckdns.org/mono` |
| Attachments | `https://nooklab.duckdns.org/attachments` |

O servidor guarda apenas blocos encriptados. A chave fica no aparelho, associada à conta — portanto é a conta que garante o acesso às mesmas notas, não o nome da app.

## Identidade

| Plataforma | Nome | ID |
|---|---|---|
| Web | NookLab | (manifest PWA) |
| Desktop | NookLab | `org.basthy28.nooklab` |
| Android | NookLab | `com.basthy28.nooklab` |

ID diferente do da app oficial (`com.streetwriters.notesnook` / `org.streetwriters.notesnook`) para as duas poderem coexistir sem sobrepor dados locais.

## Atualizações

O `master` do upstream é `streetwriters/notesnook` (remote `upstream`). As alterações do NookLab vivem no branch `nooklab`.

```bash
bash scripts/nooklab-sync.sh
```

O script faz `fetch upstream master` + `rebase` do branch `nooklab` por cima. Se uma alteração nossa tocar no mesmo ficheiro que o upstream, o rebase pára com conflito — é o sinal para ajustar. Regras para minimizar conflitos: criar ficheiros novos em vez de editar os do upstream, e manter as mudanças isoladas.

## Licença

GPL-3.0-or-later, igual ao upstream. É um fork — não é um produto oficial da Streetwriters e não usa a marca deles com esse sentido.
